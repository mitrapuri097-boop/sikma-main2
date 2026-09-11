const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: "dashboard.view",

  WEBGIS_LAYER_VIEW: "webgis.layer.view",
  WEBGIS_LAYER_DOWNLOAD: "webgis.layer.download",
  WEBGIS_LAYER_CREATE: "webgis.layer.create",
  WEBGIS_LAYER_UPDATE: "webgis.layer.update",
  WEBGIS_LAYER_DELETE: "webgis.layer.delete",
  WEBGIS_LAYER_PUBLISH: "webgis.layer.publish",

  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_SUSPEND: "users.suspend",
  USERS_DEACTIVATE: "users.deactivate",
  USERS_PASSWORD_UPDATE: "users.password.update",

  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_ASSIGN: "roles.assign",

  AUDIT_VIEW: "audit.view",
});

const SYSTEM_ROLES = Object.freeze({
  PUBLIC: "SIM_PUBLIC",
  DOWNLOADER: "SIM_DOWNLOADER",
  DATA_ADMIN: "SIM_DATA_ADMIN",
  INSTANSI: "SIM_INSTANSI",
  INTERNAL: "SIM_INTERNAL",
  ADMIN: "SIM_ADMIN",
});

module.exports = {
  PERMISSIONS,
  SYSTEM_ROLES,
};
