import * as constants from "./constants";
import * as config from "./config";
import * as defaults from "./defaults";
import { ChromaClient } from "chromadb";

let client: ChromaClient | null = null;
const register = (c: ChromaClient | undefined | null) => {
  client = c ?? defaults.createChromaClient();
  return client;
};
const getClient = () => {
  if (!client) throw new Error("Chroma client not initialized");
  return client;
};

const module = {
  constants,
  config,
  defaults,
  register,
  getClient,
};

export default module;
