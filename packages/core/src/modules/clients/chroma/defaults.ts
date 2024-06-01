import { DEFAULT_CHROMA_DB } from "./constants";
import { ChromaClient } from "chromadb";

export const createChromaClient = () =>
  new ChromaClient({
    database: DEFAULT_CHROMA_DB,
  });
