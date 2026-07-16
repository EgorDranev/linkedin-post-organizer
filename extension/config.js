// Fixed application origin for the hosted beta.
//
// The packaged extension always talks to the hosted app — the origin is not
// user-configurable at runtime. Self-hosters: edit appOrigin (and the matching
// host_permissions entry in manifest.json) before packaging.
globalThis.LIS_CONFIG = Object.freeze({
  appOrigin: "https://linkedin-saver.vercel.app",
});
