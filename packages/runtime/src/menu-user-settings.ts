import type { RestGoUser } from '@webrad/restgo-sdk';
import { applyWebMenuAppearance, menuElement } from './menu-dom.js';
import { isWebMenuLink, type WebMenuConfiguration } from './menu-model.js';
import { createLucideIconElement } from './icon.js';
import { getRestGoClient } from './restgo.js';
import { webMenuUserSettingsError, webMenuUserSettingsText } from './menu-user-settings-i18n.js';
/** A native dialog preserves focus trapping and renders above mobile drawers. */
export function openWebMenuUserSettings(
  owner: HTMLElement,
  configuration: WebMenuConfiguration,
  onClose: () => void,
): () => void {
  const client = getRestGoClient();
  const t = webMenuUserSettingsText(configuration.user.settingsLanguage);
  const document = owner.ownerDocument;
  const dialog = menuElement(document, 'dialog', 'wr-account-dialog');
  dialog.lang = configuration.user.settingsLanguage ?? 'en';
  const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => menuElement(document, tag, className, text);
  const shell = element('div', 'wr-account-shell');
  const header = element('header', 'wr-account-header');
  const heading = element('div', 'wr-account-heading');
  const title = element('h2', '', t('Your account'));
  // The owner prefix is unique per physical Menu placement.
  title.id = `wr-account-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', title.id);
  heading.append(title);
  const close = element('button', 'wr-account-close');
  close.type = 'button';
  close.setAttribute('aria-label', t('Close user settings'));
  close.append(createLucideIconElement(document, 'x'));
  header.append(heading, close);
  const tabs = element('div', 'wr-account-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', t('Account settings'));
  const body = element('div', 'wr-account-body');
  const feedback = element('p', 'wr-account-feedback', t('Loading your account…'));
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  const footer = element('footer', 'wr-account-footer');
  footer.append(feedback);
  shell.append(header, tabs, body, footer);
  dialog.append(shell);
  applyWebMenuAppearance(dialog, configuration);
  dialog.style.fontFamily = document.defaultView?.getComputedStyle(owner).fontFamily ?? 'inherit';
  let active = true;
  let busy = false;
  let signedOut = false;
  let user: RestGoUser | null = null;
  let selectedPhoto: File | undefined;
  let previewUrl = '';
  let savedName = '';
  let savedEmail = '';
  const identity = client.CurrentUser?.id;
  const abort = new AbortController();
  const previousOverflow = document.body.style.overflow;
  const fieldsets: HTMLFieldSetElement[] = [];
  const controls: HTMLButtonElement[] = [];
  const message = (text: string, kind = ''): void => {
    if (!active) return;
    feedback.textContent = text;
    feedback.dataset.kind = kind;
    feedback.hidden = !text;
  };
  const lock = (value: boolean): void => {
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    for (const fields of fieldsets) fields.disabled = value || signedOut || !user;
    for (const button of controls) button.disabled = value || signedOut || !user;
    close.disabled = value;
    footer
      .querySelector<HTMLButtonElement>('[data-account-dismiss]')
      ?.toggleAttribute('disabled', value);
    syncActions();
  };
  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy || !active || signedOut) return;
    lock(true);
    message(t('Saving…'));
    try {
      await work();
    } catch (error) {
      message(webMenuUserSettingsError(error, configuration.user.settingsLanguage), 'error');
    } finally {
      if (active && !signedOut && client.CurrentUser?.id !== identity) dispose();
      else if (active) lock(false);
    }
  };
  const button = (caption: string, action: () => void, primary = false): HTMLButtonElement => {
    const result = element(
      'button',
      `wr-account-button${primary ? ' wr-account-primary' : ''}`,
      caption,
    );
    result.type = 'button';
    result.addEventListener('click', action);
    controls.push(result);
    return result;
  };
  const field = (
    parent: HTMLElement,
    caption: string,
    type: string,
    autocomplete: string,
  ): HTMLInputElement => {
    const label = element('label', 'wr-account-field');
    label.append(element('span', '', caption));
    const input = element('input', '');
    input.type = type;
    input.setAttribute('autocomplete', autocomplete);
    input.addEventListener('input', () => {
      input.setCustomValidity('');
      if (!busy) message('');
      syncActions();
    });
    input.addEventListener('invalid', () => {
      if (input.validity.customError) return;
      input.setCustomValidity(
        input.validity.valueMissing
          ? t('Please fill out this field.')
          : input.validity.typeMismatch
            ? t('Please enter a valid email address.')
            : input.validity.tooShort
              ? t('Use at least 6 characters.')
              : input.validity.tooLong
                ? t('This value is too long.')
                : t('Check this field and try again.'),
      );
    });
    label.append(input);
    parent.append(label);
    return input;
  };
  const profile = element('section', '');
  const security = element('section', '');
  const panels = [profile, security];
  const tabButtons = [t('Profile'), t('Security')].map((caption, index) => {
    const tab = element('button', '', caption);
    tab.type = 'button';
    tab.id = `${title.id}-tab-${String(index)}`;
    tab.setAttribute('role', 'tab');
    const panel = panels[index]!;
    panel.id = `${title.id}-panel-${String(index)}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tab.setAttribute('aria-controls', panel.id);
    tab.addEventListener('click', () => selectTab(index));
    tabs.append(tab);
    return tab;
  });
  function selectTab(index: number): void {
    tabButtons.forEach((tab, current) => {
      tab.setAttribute('aria-selected', String(index === current));
      tab.tabIndex = index === current ? 0 : -1;
      panels[current]!.hidden = index !== current;
    });
    save.hidden = index !== 0;
    changePassword.hidden = index !== 1;
  }
  tabs.addEventListener('keydown', (event) => {
    const current = tabButtons.findIndex((tab) => tab === document.activeElement);
    if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - current;
    selectTab(index);
    tabButtons[index]?.focus();
  });
  body.append(profile, security);
  const form = element('form', 'wr-account-form');
  form.id = `${title.id}-profile-form`;
  const fields = element('fieldset', 'wr-account-fields');
  fieldsets.push(fields);
  const photo = element('div', 'wr-account-photo');
  const avatar = element('div', 'wr-account-avatar');
  avatar.setAttribute('aria-hidden', 'true');
  const photoCopy = element('div', 'wr-account-photo-copy');
  photoCopy.append(element('strong', '', t('Profile photo')));
  const file = element('input', 'wr-account-file');
  file.type = 'file';
  file.accept = 'image/jpeg,image/png,image/webp';
  file.setAttribute('aria-label', t('Upload profile photo'));
  file.hidden = true;
  const choosePhoto = button(t('Choose photo'), () => file.click());
  choosePhoto.classList.add('wr-account-upload');
  choosePhoto.prepend(createLucideIconElement(document, 'upload'));
  const fileName = element('span', 'wr-account-file-name');
  fileName.hidden = true;
  fileName.setAttribute('aria-live', 'polite');
  const removePhoto = button(t('Remove photo'), () => {
    void run(async () => {
      const result = await client.auth.deleteAvatar({ signal: abort.signal });
      if (result.error) throw result.error;
      if (user) user = { ...user, avatarUrl: result.data.avatarUrl };
      drawAvatar();
      message(t('Profile photo removed.'), 'success');
    });
  });
  removePhoto.classList.add('wr-account-text-button');
  removePhoto.hidden = true;
  const savePhoto = button(
    t('Save photo'),
    () => {
      if (!selectedPhoto) return;
      const selected = selectedPhoto;
      void run(async () => {
        const result = await client.auth.uploadAvatar(selected, { signal: abort.signal });
        if (result.error) throw result.error;
        if (!active) return;
        if (user) user = { ...user, avatarUrl: result.data.avatarUrl };
        clearPhotoPreview();
        drawAvatar();
        message(t('Profile photo updated.'), 'success');
      });
    },
    true,
  );
  const cancelPhoto = button(t('Cancel photo'), () => {
    clearPhotoPreview();
    drawAvatar();
    message(t('Photo selection discarded.'));
  });
  savePhoto.hidden = cancelPhoto.hidden = true;
  const photoActions = element('div', 'wr-account-actions');
  photoActions.append(choosePhoto, savePhoto, cancelPhoto, removePhoto);
  photoCopy.append(
    file,
    photoActions,
    fileName,
    element('p', 'wr-account-hint', t('JPEG, PNG or WebP · 10 MB max.')),
  );
  photo.append(avatar, photoCopy);
  fields.append(photo);
  const fullName = field(fields, t('Full name'), 'text', 'name');
  fullName.maxLength = 150;
  const email = field(fields, t('Email address'), 'email', 'email');
  email.required = true;
  email.maxLength = 254;
  const emailBadge = element('span', 'wr-account-badge');
  email.parentElement!.querySelector('span')!.append(emailBadge);
  const emailPassword = field(
    fields,
    t('Current password to change email'),
    'password',
    'current-password',
  );
  emailPassword.parentElement!.hidden = true;
  const emailHint = element(
    'p',
    'wr-account-hint',
    t('Changing your email signs you out on all devices.'),
  );
  emailHint.hidden = true;
  const updateEmailPassword = (): void => {
    const changed = email.value.trim().toLowerCase() !== user?.email.toLowerCase();
    emailPassword.parentElement!.hidden = !changed;
    emailHint.hidden = !changed;
    emailPassword.required = changed;
    if (!changed) {
      emailPassword.value = '';
      emailPassword.setCustomValidity('');
    }
  };
  email.addEventListener('input', updateEmailPassword);
  fields.append(emailHint);
  const summary = element('div', 'wr-account-summary');
  const accountDetails = element('details', 'wr-account-details');
  accountDetails.append(element('summary', '', t('Account details')), summary);
  const resend = button(t('Resend confirmation email'), () => {
    void run(async () => {
      const result = await client.auth.resendEmailConfirmation({
        signal: abort.signal,
        ...(configuration.user.emailConfirmationUrl
          ? { url: configuration.user.emailConfirmationUrl }
          : {}),
      });
      if (result.error) throw result.error;
      message(t('Confirmation email requested. Check your inbox.'), 'success');
    });
  });
  resend.classList.add('wr-account-text-button');
  fields.insertBefore(resend, emailPassword.parentElement);
  fields.append(accountDetails);
  const save = element('button', 'wr-account-button wr-account-primary', t('Save profile'));
  save.type = 'submit';
  save.setAttribute('form', form.id);
  controls.push(save);
  form.append(fields);
  profile.append(form);
  const passwordForm = element('form', 'wr-account-form');
  passwordForm.id = `${title.id}-password-form`;
  const passwordFields = element('fieldset', 'wr-account-fields');
  fieldsets.push(passwordFields);
  passwordFields.append(
    element('p', 'wr-account-hint', t('Changing your password signs you out on all devices.')),
  );
  const currentPassword = field(
    passwordFields,
    t('Current password'),
    'password',
    'current-password',
  );
  const newPassword = field(passwordFields, t('New password'), 'password', 'new-password');
  const confirmation = field(passwordFields, t('Confirm new password'), 'password', 'new-password');
  currentPassword.required = newPassword.required = confirmation.required = true;
  newPassword.minLength = confirmation.minLength = 6;
  for (const input of [currentPassword, newPassword, confirmation, emailPassword])
    input.maxLength = 1024;
  const changePassword = element(
    'button',
    'wr-account-button wr-account-primary',
    t('Update password'),
  );
  changePassword.type = 'submit';
  changePassword.setAttribute('form', passwordForm.id);
  controls.push(changePassword);
  const securityActions = element('div', 'wr-account-security-actions');
  const resetPassword = button(t('Reset password by email'), () => {
    void run(async () => {
      if (!user) return;
      const result = await client.auth.resetPasswordForEmail(
        user.email,
        configuration.user.passwordResetUrl ? { url: configuration.user.passwordResetUrl } : {},
      );
      if (result.error) throw result.error;
      message(t('Password reset requested. Check your inbox.'), 'success');
    });
  });
  resetPassword.classList.add('wr-account-text-button');
  const signOut = button(t('Sign out'), () => {
    void run(async () => {
      const result = await client.logout();
      if (result.error) throw result.error;
      signedOut = true;
      message(t('You have been signed out.'), 'success');
    });
  });
  signOut.classList.add('wr-account-text-button');
  securityActions.append(resetPassword, signOut);
  passwordFields.append(securityActions);
  passwordForm.append(passwordFields);
  security.append(passwordForm);
  const footerActions = element('div', 'wr-account-footer-actions');
  const dismiss = element('button', 'wr-account-button', t('Close'));
  dismiss.type = 'button';
  dismiss.dataset.accountDismiss = '';
  dismiss.addEventListener('click', () => close.click());
  footerActions.append(dismiss, save, changePassword);
  footer.append(footerActions);
  selectTab(0);
  function syncActions(): void {
    save.disabled =
      busy ||
      signedOut ||
      !user ||
      (fullName.value.trim() === savedName &&
        email.value.trim().toLowerCase() === savedEmail.toLowerCase());
    changePassword.disabled =
      busy ||
      signedOut ||
      !user ||
      !currentPassword.value ||
      !newPassword.value ||
      !confirmation.value;
    save.textContent = busy && user ? t('Saving…') : t('Save profile');
    changePassword.textContent = busy && user ? t('Saving…') : t('Update password');
  }
  function drawAvatar(): void {
    if (!active) return;
    avatar.replaceChildren();
    const source = previewUrl || user?.avatarUrl || '';
    if (source && (previewUrl || isWebMenuLink(source, true))) {
      const image = element('img', '');
      image.src = new URL(source, client.baseUrl + '/').href;
      image.alt = '';
      avatar.append(image);
    } else
      avatar.textContent = (user?.fullName || user?.email || '?')
        .trim()
        .split(/\s+/u)
        .slice(0, 2)
        .map((part) => part[0] ?? '')
        .join('')
        .toLocaleUpperCase();
    removePhoto.hidden = !user?.avatarUrl || !!selectedPhoto;
    savePhoto.hidden = cancelPhoto.hidden = !selectedPhoto;
    choosePhoto.hidden = !!selectedPhoto;
    fileName.hidden = !selectedPhoto;
  }
  function clearPhotoPreview(): void {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    selectedPhoto = undefined;
    file.value = '';
    fileName.textContent = '';
    fileName.removeAttribute('title');
    fileName.hidden = true;
  }
  function drawSummary(): void {
    if (!active || !user) return;
    summary.replaceChildren();
    emailBadge.textContent = user.emailConfirmed ? t('Verified') : t('Unverified');
    for (const [caption, value] of [
      [t('Account'), user.active ? t('Active') : t('Inactive')],
      [t('User ID'), user.id],
    ]) {
      const row = element('div', 'wr-account-detail');
      row.append(
        element('span', '', caption),
        element('span', caption === t('User ID') ? '' : 'wr-account-badge', value),
      );
      summary.append(row);
    }
    resend.hidden = user.emailConfirmed;
  }
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    if (!selected) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) ||
      selected.size > 10 * 1024 * 1024
    ) {
      file.value = '';
      message(t('Choose a JPEG, PNG or WebP image up to 10 MB.'), 'error');
      return;
    }
    clearPhotoPreview();
    selectedPhoto = selected;
    previewUrl = URL.createObjectURL(selected);
    fileName.textContent = selected.name;
    fileName.title = selected.name;
    drawAvatar();
    message(t('Photo ready to save.'));
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!user || !form.reportValidity()) return;
    if (new TextEncoder().encode(fullName.value.trim()).length > 150) {
      message(t('Full name is too long. Shorten it and try again.'), 'error');
      fullName.focus();
      return;
    }
    void run(async () => {
      const result = await client.auth.updateUser(
        {
          fullName: fullName.value.trim(),
          email: email.value.trim(),
          ...(configuration.user.emailConfirmationUrl
            ? { emailConfirmationUrl: configuration.user.emailConfirmationUrl }
            : {}),
          ...(emailPassword.required ? { currentPassword: emailPassword.value } : {}),
        },
        { signal: abort.signal },
      );
      if (result.error) throw result.error;
      if (!active) return;
      user = result.data.user;
      signedOut = result.data.sessionRevoked;
      emailPassword.value = '';
      fullName.value = user.fullName;
      email.value = user.email;
      savedName = user.fullName;
      savedEmail = user.email;
      updateEmailPassword();
      drawSummary();
      message(
        signedOut
          ? t('Account updated. Sign in again with your updated email.')
          : t('Your profile has been saved.'),
        'success',
      );
    });
  });
  passwordForm.addEventListener('submit', (event) => {
    event.preventDefault();
    confirmation.setCustomValidity(
      newPassword.value === confirmation.value ? '' : t('Passwords do not match.'),
    );
    if (!passwordForm.reportValidity()) return;
    void run(async () => {
      const result = await client.auth.updateUser(
        {
          password: newPassword.value,
          currentPassword: currentPassword.value,
          ...(configuration.user.emailConfirmationUrl
            ? { emailConfirmationUrl: configuration.user.emailConfirmationUrl }
            : {}),
        },
        { signal: abort.signal },
      );
      if (result.error) throw result.error;
      signedOut = result.data.sessionRevoked;
      passwordForm.reset();
      message(t('Password updated. Sign in again with your new password.'), 'success');
    });
  });
  confirmation.addEventListener('input', () => confirmation.setCustomValidity(''));
  newPassword.addEventListener('input', () => confirmation.setCustomValidity(''));
  const subscription = client.onAuthStateChange((event, session) => {
    if (!active) return;
    if (session && session.user.id !== identity) {
      dispose();
      return;
    }
    if (!session) {
      if (event !== 'INITIAL_SESSION' && !busy) dispose();
      return;
    }
    user = { ...session.user };
    drawAvatar();
    drawSummary();
  });
  function dispose(): void {
    if (!active) return;
    active = false;
    abort.abort();
    clearPhotoPreview();
    subscription.unsubscribe();
    form.reset();
    passwordForm.reset();
    dialog.close();
    dialog.remove();
    document.body.style.overflow = previousOverflow;
    onClose();
  }
  close.addEventListener('click', () => {
    if (!busy) dispose();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!busy) dispose();
  });
  dialog.addEventListener('close', dispose);
  document.body.append(dialog);
  try {
    dialog.showModal();
    document.body.style.overflow = 'hidden';
  } catch (error) {
    dispose();
    throw error;
  }
  lock(true);
  void client
    .getUser()
    .then((result) => {
      if (!active) return;
      if (result.error) throw result.error;
      if (!result.data || result.data.id !== identity) {
        dispose();
        return;
      }
      user = result.data;
      fullName.value = user.fullName;
      email.value = user.email;
      savedName = user.fullName;
      savedEmail = user.email;
      drawAvatar();
      drawSummary();
      lock(false);
      message('');
      fullName.focus();
    })
    .catch((error: unknown) => {
      if (!active) return;
      if (client.CurrentUser?.id !== identity) {
        dispose();
        return;
      }
      lock(false);
      message(webMenuUserSettingsError(error, configuration.user.settingsLanguage), 'error');
    });
  return dispose;
}
