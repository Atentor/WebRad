import {
  createDefaultWebLoginConfiguration,
  parseWebLoginConfiguration,
  WEB_LOGIN_STYLE_SLOTS,
} from '@webrad/runtime/login-model';
import type { ComponentDefinition, ComponentPropertyDefinition } from './types.js';

export function createWebLoginDefinition(
  geometry: readonly ComponentPropertyDefinition[],
): ComponentDefinition {
  return {
    type: 'WebLogin',
    displayName: 'Login',
    namePrefix: 'Login',
    palette: { category: 'Authentication', caption: 'Login' },
    icon: 'user',
    visual: true,
    canHaveChildren: false,
    defaultEvent: 'OnLogin',
    designerAction: 'login-configurator',
    defaultBounds: { width: 420, height: 400 },
    defaults: {
      configuration: createDefaultWebLoginConfiguration(),
      visible: true,
      enabled: true,
      collapseWhenHidden: true,
    },
    styleDependencies: ['WebPanel', 'WebLabel', 'WebEdit', 'WebButton', 'WebCheckBox', 'WebPopup'],
    embeddedStyles: { propertyPath: ['configuration', 'styles'], slots: WEB_LOGIN_STYLE_SLOTS },
    styleEditor: {
      essentialProperties: [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'letterSpacing',
        'lineHeight',
        'borderWidth',
        'borderStyle',
        'borderColor',
        'borderRadius',
        'boxShadow',
        'opacity',
      ],
    },
    properties: [
      ...geometry.map((property) =>
        property.source === 'layout-item' && property.name === 'itemHeight'
          ? { ...property, defaultValue: 'fit-content' }
          : property,
      ),
      {
        name: 'configuration',
        label: 'Login configuration',
        type: 'login-config',
        category: 'Login',
        source: 'props',
        designerAction: 'login-configurator',
        defaultValue: createDefaultWebLoginConfiguration(),
        description:
          'Configure login, registration and account recovery, text, internal project Styles, Panel or Popup, and RestGo behavior.',
        validateValue: (value) => {
          try {
            parseWebLoginConfiguration(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    ],
    events: [
      {
        name: 'OnLogin',
        category: 'Login',
        eventDetailType: 'WebLoginUserEvent',
        eventDetailProperties: ['user', 'restored'],
        description:
          'A login or restored server-validated session. Credentials are never included.',
      },
      {
        name: 'OnRegister',
        category: 'Login',
        eventDetailType: 'WebLoginUserEvent',
        eventDetailProperties: ['user'],
        description: 'RestGo created the account. This alone does not start a session.',
      },
      {
        name: 'OnRecoveryRequested',
        category: 'Recovery',
        eventDetailType: 'WebLoginRecoveryEvent',
        eventDetailProperties: ['email'],
        description:
          'RestGo accepted the request. This does not reveal account existence or prove email delivery.',
      },
      {
        name: 'OnPasswordReset',
        category: 'Recovery',
        description:
          'RestGo accepted the new password. Returns to login without starting a session.',
      },
      {
        name: 'OnError',
        category: 'Login',
        eventDetailType: 'WebLoginErrorEvent',
        eventDetailProperties: ['operation', 'message', 'code', 'status'],
      },
      {
        name: 'OnViewChange',
        category: 'Login',
        eventDetailType: 'WebLoginViewEvent',
        eventDetailProperties: ['view'],
      },
      { name: 'OnClose', category: 'Login' },
    ],
  };
}
