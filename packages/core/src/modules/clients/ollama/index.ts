import { Ollama } from "ollama";
import * as config from "./config";
import * as constants from "./constants";
import * as defaults from "./defaults";
import * as behaviour from "./behaviour";

let client: Ollama | null = null;
const register = (c: Ollama | undefined | null) => {
  client = c ?? defaults.createOllamaClient();
  return client;
};
const getClient = () => {
  if (!client) throw new Error("Kafka client not initialized");
  return client;
};

const module = { config, constants, defaults, register, getClient, behaviour };

export default module;
