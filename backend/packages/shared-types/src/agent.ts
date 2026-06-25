// AI Bible agent (NVIDIA-hosted Qwen, OpenAI-compatible API).
// Every answer is grounded in Bible teaching and quotes scripture; `references`
// lists the verse references detected in the answer for the UI to render.

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  /** The assistant's answer, grounded in scripture and quoting verse(s). */
  answer: string;
  /** Scripture references found in the answer, e.g. ["Matthew 5:3", "John 3:16"]. */
  references: string[];
}
