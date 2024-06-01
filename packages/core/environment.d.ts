declare global {
  namespace NodeJS {
    interface ProcessEnv {
      LOCAL_RECALL_DEBUG: "TRUE" | "FALSE" | undefined
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
