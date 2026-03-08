import { handleMusicSearchRequest } from "./_music.js";

export default async function handler(req, res) {
  return handleMusicSearchRequest(req, res);
}
