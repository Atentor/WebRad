# Panel background image

Select a Panel and use **Appearance > Background image** to enter an image URL, a data URL, or an imported asset path such as `assets/imported/background.png` (available from the asset preview).

- **Background size**: `cover` (default, fills with cropping), `contain` (full image), `auto` (original size), or `stretch` (fills both dimensions).
- **Background position**: center (default), an edge, or a corner.
- **Background repeat**: `no-repeat` (default), `repeat`, `repeat-x`, or `repeat-y`.

The four properties persist in the format-v2 component property bag. Existing Panels with no image retain their appearance. The image takes precedence over the selected style's background image/gradient; clearing the URL restores the style. Child layout, events, border and component IDs are unaffected. Imported assets use a data URL projection in the Designer without changing the saved path; Preview and Deploy export the referenced asset normally.

The same properties are available with typed completion in page and reusable code:

```ts
Panel1.backgroundImage = 'assets/imported/background.png';
this.Panel1.backgroundSize = 'cover';
Panel1.backgroundPosition = 'center';
Panel1.backgroundRepeat = 'no-repeat';
Panel1.backgroundImage = ''; // Restore the selected style's background.
```

Group has no background controls in the Inspector and remains transparent by default.
