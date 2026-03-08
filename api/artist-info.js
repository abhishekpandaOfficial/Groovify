import { handleArtistInfoRequest } from "./_music.js";

export default async function handler(req, res) {
  return handleArtistInfoRequest(req, res);
}
