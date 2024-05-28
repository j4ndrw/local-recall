declare global {
  namespace NodeJS {
    interface ProcessEnv {
      OLLAMA_HOST: string | undefined;
      CHROMA_HOST: string | undefined;
      CHROMA_DB: string | undefined;
      KAFKA_CLIENT_ID: string | undefined;
      KAFKA_BROKER: string | undefined;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
