import { Ollama } from "ollama";
import { DEFAULT_OLLAMA_HOST } from "./constants";

export const createOllamaClient = () => new Ollama({ host: DEFAULT_OLLAMA_HOST })
