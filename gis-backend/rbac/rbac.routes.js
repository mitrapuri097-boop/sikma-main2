const express = require("express");
const {
  createPermissionService,
} = require("./permission.service");

function createRbacRouter({ pool, verifyToken } = {}) {
  if (!pool) throw new Error("createRbacRouter: pool wajib diberikan.");
  if (typeof verifyToken !== "function") {
    throw new Error(
      "createRbacRouter: gunakan verifyToken JWT yang SUDAH ADA di server.js.",
    );
  }

  const router = express.Router();
  const permissionService = createPermissionService({ pool });

  // GET /api/rbac/me
  router.get("/me", verifyToken, async (req, res) => {
    try {
      const data = await permissionService.getMe(req.user);

      if (!data.user) {
        return res.status(404).json({
          success: false,
          message: "User tidak ditemukan.",
        });
      }

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("GET /api/rbac/me ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Gagal mengambil RBAC user.",
      });
    }
  });

  // GET /api/rbac/check?permission=webgis.layer.publish
  router.get("/check", verifyToken, async (req, res) => {
    try {
      const permission = String(req.query.permission || "").trim();

      if (!permission) {
        return res.status(400).json({
          success: false,
          message: "Query permission wajib diisi.",
        });
      }

      const allowed = await permissionService.can(req.user, permission);

      return res.json({
        success: true,
        permission,
        allowed,
      });
    } catch (error) {
      console.error("GET /api/rbac/check ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Gagal memeriksa permission.",
      });
    }
  });

  // Expose the service for server.js route protection.
  router.permissionService = permissionService;

  return router;
}

module.exports = {
  createRbacRouter,
};
