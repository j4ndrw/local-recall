export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
export const DEFAULT_CHROMA_HOST = "http://localhost:8000"
export const DEFAULT_CHROMA_DB = "recall"

export const IMAGE_DESCRIPTION_PROMPT = 'This is a screenshot of a desktop, describe what you see, what windows or programs are open, and what is the user doing. If there is a web browser open, describe the contents of the web page. Refrain from using the word "screenshot" or "desktop" in your description.'
export const IMAGE_DESCRIPTION_MODEL = 'llava-phi3:3.8b-mini-q4_0'

export const INTERPRETER_PROMPT = (initialQuery: string, queryResults: string[]) => `
  You are responsible with interpreting some descriptions such that they answer to a given question.

  Question: ${initialQuery}
  Descriptions: ${queryResults.map(r => `\t\t- ${r}`)}
`
export const INTERPRETER_MODEL = 'mistral-openorca:7b-q4_K_M';

export const EMBEDDING_MODEL = 'mxbai-embed-large'

export const COLLECTION_NAME = "recall-screenshots";
