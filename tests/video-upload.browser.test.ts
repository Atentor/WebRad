import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '@webrad/compiler';
import { updatePage, updateProjectSettings } from '@webrad/project-model';
import { videoBackend, videoUploadProject, videoUploadUserSources } from './fixtures/video-upload';
import { withChromium } from './chromium';
const browser = process.env.WEBRAD_BROWSER_PATH;
it.runIf(browser !== undefined)(
  'runs real video metadata/limits and resumable binary upload in Chromium compiled Preview',
  async () => {
    const backend = videoBackend({ conflictAfterFirstChunk: true, maxChunkBytes: 1024 });
    const errors: unknown[] = [];
    const api = createServer((request, response) => {
      void (async () => {
        response.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        response.setHeader(
          'Access-Control-Allow-Headers',
          'Authorization,Content-Type,Upload-Offset,Upload-Checksum',
        );
        response.setHeader('Access-Control-Expose-Headers', 'Upload-Offset');
        if (request.method === 'OPTIONS') {
          response.writeHead(204);
          response.end();
          return;
        }
        expect(request.headers.cookie).toBeUndefined();
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers))
          if (value !== undefined)
            headers.set(name, Array.isArray(value) ? value.join(',') : value);
        const result = await backend.fetcher(`http://127.0.0.1${request.url}`, {
          method: request.method,
          headers,
          body:
            body.length === 0
              ? undefined
              : headers.get('Content-Type') === 'application/octet-stream'
                ? new Blob([body])
                : body.toString(),
        });
        response.writeHead(result.status, { 'Content-Type': 'application/json' });
        response.end(await result.text());
      })().catch((error: unknown) => {
        errors.push(error);
        response.writeHead(500);
        response.end();
      });
    });
    let preview = '';
    const app = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        _request.url === '/index.html'
          ? preview
          : '<!doctype html><iframe style="width:100%;height:600px;border:0" src="/index.html"></iframe>',
      );
    });
    await Promise.all([
      new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve)),
      new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve)),
    ]);
    const apiAddress = api.address();
    const appAddress = app.address();
    if (
      !apiAddress ||
      typeof apiAddress === 'string' ||
      !appAddress ||
      typeof appAddress === 'string'
    )
      throw new Error('Missing test ports');
    try {
      const initial = videoUploadProject();
      const page = initial.pages[0]!;
      const prepared = updatePage(initial, page.id, {
        components: page.components.map((entry) =>
          entry.type === 'WebVideoUpload'
            ? { ...entry, props: { ...entry.props, chunkSizeBytes: 1024, maxDurationSeconds: 2 } }
            : entry,
        ),
      });
      const project = updateProjectSettings(prepared, {
        restGo: {
          ...prepared.settings.restGo,
          baseUrl: `http://127.0.0.1:${apiAddress.port}/proxy/restgo`,
        },
      });
      const result = await compileProjectToMemory(project, {
        userSources: videoUploadUserSources(page.name),
      });
      expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
      preview = result.previewHtml ?? '';
      await withChromium(browser!, `http://127.0.0.1:${appAddress.port}/`, async (send) => {
        const evaluate = async (expression: string): Promise<unknown> => {
          const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return (
            result.result as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value;
        };
        const frame = 'document.querySelector("iframe").contentWindow';
        const root = `${frame}.document.querySelector('[data-webrad-page-id]')`;
        await expect.poll(() => evaluate(`Boolean(${root})`), { timeout: 10000 }).toBe(true);
        // A real VP8 WebM produced by Chromium. Add its finite Duration metadata
        // because MediaRecorder emits a streaming segment without that field.
        const size = await evaluate(`(async () => {
        const frame = ${frame}; const canvas = frame.document.createElement('canvas'); canvas.width=320; canvas.height=240;
        const ctx=canvas.getContext('2d'); ctx.fillStyle='blue'; ctx.fillRect(0,0,320,240);
        const stream=canvas.captureStream(10); const parts=[];
        const recorder=new frame.MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
        recorder.ondataavailable=(event)=>parts.push(event.data);
        const done=new Promise(resolve=>recorder.onstop=resolve); recorder.start();
        const tick=setInterval(()=>{ctx.fillStyle='red';ctx.fillRect(Math.random()*300,0,10,240)},50);
        await new Promise(resolve=>setTimeout(resolve,1000)); recorder.stop(); await done; clearInterval(tick); stream.getTracks().forEach(track=>track.stop());
        const bytes=new Uint8Array(await new frame.Blob(parts).arrayBuffer());
        let start=-1,length=0,value=0;
        for(let i=0;i<bytes.length-4;i++) {
          if(bytes[i]!==0x15 || bytes[i+1]!==0x49 || bytes[i+2]!==0xa9 || bytes[i+3]!==0x66)continue;
          const candidate=i+4;let sizeLength=1;while(sizeLength<=8 && !(bytes[candidate] & (0x80 >> (sizeLength-1))))sizeLength++;
          if(sizeLength>8)continue;
          let size=bytes[candidate] & ((0x80 >> (sizeLength-1))-1);for(let j=1;j<sizeLength;j++)size=size*256+bytes[candidate+j];
          const dataStart=candidate+sizeLength;
          if(dataStart+size>bytes.length || !((bytes[dataStart]===0x2a && bytes[dataStart+1]===0xd7 && bytes[dataStart+2]===0xb1) || (bytes[dataStart]===0x4d && bytes[dataStart+1]===0x80)))continue;
          start=candidate;length=sizeLength;value=size;break;
        }
        if(start<0)throw Error('Missing WebM Info');
        const duration=new Uint8Array(11);duration.set([0x44,0x89,0x88]);new DataView(duration.buffer).setFloat64(3,1000,false);
        const end=start+length+value; const output=new Uint8Array(bytes.length+11);output.set(bytes.slice(0,end));output.set(duration,end);output.set(bytes.slice(end),end+11);
        let encoded=value+11;for(let i=length-1;i>=0;i--){output[start+i]=encoded&255;encoded=Math.floor(encoded/256)}output[start]|=0x80 >> (length-1);
        frame.fixtureFile=new frame.File([output],'aula.webm',{type:'video/webm',lastModified:123});
        const longer=output.slice();new DataView(longer.buffer).setFloat64(end+3,3000,false);
        frame.longFixtureFile=new frame.File([longer],'long.webm',{type:'video/webm',lastModified:123});return output.length;
      })()`);
        expect(Number(size)).toBeGreaterThan(1024);
        const choose = async (kind: 'valid' | 'duration' | 'size') => {
          await evaluate(`(() => {
          const frame=${frame}; const root=${root}; delete root.dataset.rejected; delete root.dataset.selection;
          root.querySelector('[data-webrad-name="ChooseVideo"]').click();
          const transfer=new frame.DataTransfer();
          ${
            kind === 'valid'
              ? 'transfer.items.add(frame.fixtureFile);'
              : kind === 'size'
                ? "transfer.items.add(new frame.File([new Uint8Array(6*1024*1024)],'large.webm',{type:'video/webm'}));"
                : 'transfer.items.add(frame.longFixtureFile);'
          }
          const input=frame.document.querySelector('[data-video-upload-input]'); input.files=transfer.files;input.dispatchEvent(new frame.Event('change'));
        })()`);
        };
        await choose('size');
        await expect.poll(() => evaluate(`${root}.dataset.rejected`)).toContain('MB limit');
        expect(backend.uploads.size).toBe(0);
        await choose('duration');
        await expect.poll(() => evaluate(`${root}.dataset.rejected`)).toContain('duration limit');
        expect(backend.uploads.size).toBe(0);
        await choose('valid');
        await expect.poll(() => evaluate(`${root}.dataset.selection`)).toBeDefined();
        const selected = JSON.parse(String(await evaluate(`${root}.dataset.selection`))) as {
          duration: number;
          size: number;
        };
        expect(selected.duration).toBeCloseTo(1, 1);
        expect(selected.size).toBe(size);
        expect(backend.uploads.size).toBe(0);
        await evaluate(`${root}.querySelector('[data-webrad-name="SendVideo"]').click()`);
        await expect
          .poll(() => evaluate(`${root}.dataset.uploadError`), { timeout: 10000 })
          .toContain('aborted');
        expect(backend.uploads.get('upload-1')?.session.offset).toBe(1024);
        expect(backend.calls.some((entry) => entry.method === 'DELETE')).toBe(false);
        await evaluate(`${root}.querySelector('[data-webrad-name="ResumeVideo"]').click()`);
        await expect
          .poll(() => evaluate(`${root}.dataset.video`), { timeout: 15000 })
          .toBeDefined();
        expect(backend.uploads.size).toBe(1);
        expect(backend.uploads.get('upload-1')?.content.length).toBe(size);
        await evaluate(`${root}.querySelector('[data-webrad-name="WaitVideo"]').click()`);
        await expect.poll(() => evaluate(`${root}.dataset.ready`)).toBe('video-1');
        expect(errors).toEqual([]);
      });
    } finally {
      await Promise.all([
        new Promise<void>((resolve) => {
          api.closeAllConnections();
          api.close(() => resolve());
        }),
        new Promise<void>((resolve) => {
          app.closeAllConnections();
          app.close(() => resolve());
        }),
      ]);
    }
  },
  45000,
);
