import app from "../artifacts/api-server/dist/app.mjs";

export default function handler(req, res) {
  return app(req, res);
}
