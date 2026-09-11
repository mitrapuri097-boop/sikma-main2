function createAuthorizationMiddleware({ permissionService }) {
  if (!permissionService) {
    throw new Error("createAuthorizationMiddleware membutuhkan permissionService.");
  }

  function requirePermission(moduleOrCode, action) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized.",
          });
        }

        const allowed = await permissionService.can(
          req.user,
          moduleOrCode,
          action,
        );

        if (!allowed) {
          const permission = action
            ? `${moduleOrCode}.${action}`
            : moduleOrCode;

          return res.status(403).json({
            success: false,
            message: "Akses ditolak.",
            error: "FORBIDDEN",
            permission,
          });
        }

        req.authorization = {
          permission: action ? `${moduleOrCode}.${action}` : moduleOrCode,
        };

        return next();
      } catch (error) {
        console.error("RBAC authorization error:", error);
        return res.status(500).json({
          success: false,
          message: "Gagal memeriksa permission.",
        });
      }
    };
  }

  function requireAnyPermission(...permissions) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized.",
          });
        }

        for (const item of permissions) {
          const allowed = await permissionService.can(req.user, item);
          if (allowed) return next();
        }

        return res.status(403).json({
          success: false,
          message: "Akses ditolak.",
          error: "FORBIDDEN",
          permissions,
        });
      } catch (error) {
        console.error("RBAC any-permission error:", error);
        return res.status(500).json({
          success: false,
          message: "Gagal memeriksa permission.",
        });
      }
    };
  }

  return {
    requirePermission,
    requireAnyPermission,
  };
}

module.exports = {
  createAuthorizationMiddleware,
};
