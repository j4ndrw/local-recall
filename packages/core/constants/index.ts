export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
export const DEFAULT_CHROMA_HOST = "http://localhost:8000";
export const DEFAULT_CHROMA_DB = "recall";

export const IMAGE_DESCRIPTION_PROMPT = `
  This is a screenshot of a desktop, describe, in detail, what you see, what windows or programs are open, and what is the user doing.
  If there is a web browser open, describe the contents of the web page.
  Make sure to identify what the titles / main headings are, as well as other relevant markup.

  Refrain from using the word "screenshot" or "desktop" in your description.
`;
export const DESCRIPTION_INTERPRETER_PROMPT = (
  initialQuery: string,
  queryResults: string[],
) => `
  You are responsible with interpreting some descriptions such that they answer to a given question.
  Those descriptions are text representations of something the user was doing on their computer in the past (e.g. browsing the web, writing code, listening to music, etc...).
  Interpret those description and formulate your answers as if you were an assistant that tries to describe what the user did previously.
  Only include details relevant to the question and address the user directly as if you were presenting them to the user.

  Question: ${initialQuery}
  Descriptions: ${queryResults.map((r) => `\t\t- ${r}`)}
`;
export const QUERY_INTERPRETER_PROMPT = (query: string) => `
  Please rephrase the following question such that it is more explicit: "${query}"
`

export const IMAGE_DESCRIPTION_MODEL = "llava:7b-v1.6-mistral-q5_1";
export const INTERPRETER_MODEL = "llama3:8b";
export const EMBEDDING_MODEL = "mxbai-embed-large";

export const COLLECTION_NAME = "recall-screenshots";
