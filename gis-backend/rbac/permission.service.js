const DEFAULT_CACHE_TTL_MS = 30_000;

function normalizePermission(moduleOrCode, action) {
  if (!moduleOrCode) return "";
  if (!action) return String(moduleOrCode).trim();
  return `${String(moduleOrCode).trim()}.${String(action).trim()}`;
}

function getUserId(user) {
  return user?.id ?? user?.user_id ?? user?.userId ?? null;
}

function isActiveUser(user) {
  if (!user) return false;
  const status = String(user.status ?? "active").toLowerCase();
  return !["inactive", "disabled", "deactivated", "suspended", "blocked"].includes(status);
}

function createPermissionService({ pool, cacheTtlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("createPermissionService membutuhkan PostgreSQL pool.");
  }

  const cache = new Map();

  function cacheKey(userId) {
    return String(userId);
  }

  function invalidate(userId) {
    if (userId == null) return;
    cache.delete(cacheKey(userId));
  }

  async function loadPermissions(user) {
    const userId = getUserId(user);
    if (userId == null) return [];

    const key = cacheKey(userId);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.permissions;

    const result = await pool.query(
      `
      SELECT DISTINCT
        p.code,
        p.module,
        p.resource,
        p.action,
        rp.effect
      FROM users u
      JOIN master_role r ON r.id = u.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
        AND COALESCE(u.status, 'active') NOT IN ('inactive','disabled','deactivated','suspended','blocked')
        AND COALESCE(r.status, 'active') = 'active'
        AND COALESCE(p.status, 'active') = 'active'
      ORDER BY p.code
      `,
      [userId],
    );

    const rows = result.rows || [];

    // Explicit deny wins over allow.
    const decisions = new Map();
    for (const row of rows) {
      const previous = decisions.get(row.code);
      if (!previous || row.effect === "deny") {
        decisions.set(row.code, row.effect);
      }
    }

    const permissions = rows
      .filter((row) => decisions.get(row.code) === "allow")
      .map((row) => row.code);

    cache.set(key, {
      expiresAt: Date.now() + cacheTtlMs,
      permissions,
    });

    return permissions;
  }

  async function can(user, permission, action) {
    if (!isActiveUser(user)) return false;

    const code = normalizePermission(permission, action);
    if (!code) return false;

    const permissions = await loadPermissions(user);
    return permissions.includes(code);
  }

  async function authorize(user, permission, action) {
    const code = normalizePermission(permission, action);
    const allowed = await can(user, code);

    if (!allowed) {
      const error = new Error(`Permission denied: ${code}`);
      error.code = "FORBIDDEN";
      error.permission = code;
      throw error;
    }

    return true;
  }

  async function getMe(user) {
    const permissions = await loadPermissions(user);

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.status,
        u.role_id,
        r.code AS role_code,
        r.name AS role_name,
        r.level AS role_level,
        u.organization_id,
        u.unit_id
      FROM users u
      LEFT JOIN master_role r ON r.id = u.role_id
      WHERE u.id = $1
      LIMIT 1
      `,
      [getUserId(user)],
    );

    return {
      user: result.rows[0] || null,
      permissions,
    };
  }

  return {
    can,
    authorize,
    getMe,
    loadPermissions,
    invalidate,
  };
}

module.exports = {
  createPermissionService,
  normalizePermission,
};
