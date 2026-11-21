export type AgentErrorCode =
  | "VALIDATION_ERROR"
  | "AGENT_UNAVAILABLE"
  | "AGENT_TIMEOUT"
  | "AGENT_INVALID_RESPONSE"
  | "AGENT_NOT_CONFIGURED"
  | "NOT_FOUND"
  | "NOT_IMPLEMENTED";

export type ErrorDetail = {
  field?: string;
  message: string;
  row?: number;
};

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly details: ErrorDetail[];
  readonly httpStatus: number;

  constructor(
    code: AgentErrorCode,
    message: string,
    options?: { details?: ErrorDetail[]; httpStatus?: number },
  ) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.details = options?.details ?? [];
    this.httpStatus = options?.httpStatus ?? 502;
  }

  toErrorBody(): {
    error: { code: AgentErrorCode; message: string; details: ErrorDetail[] };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export function agentNotConfigured(): AgentError {
  return new AgentError(
    "AGENT_NOT_CONFIGURED",
    "El agente no está configurado: faltan XAI_API_KEY o XAI_MODEL.",
    { httpStatus: 503 },
  );
}

export function agentTimeout(): AgentError {
  return new AgentError("AGENT_TIMEOUT", "xAI no respondió a tiempo.", {
    httpStatus: 504,
  });
}

export function agentUnavailable(message = "xAI no está disponible."): AgentError {
  return new AgentError("AGENT_UNAVAILABLE", message, { httpStatus: 502 });
}

export function agentInvalidResponse(
  message: string,
  details?: ErrorDetail[],
): AgentError {
  return new AgentError(
    "AGENT_INVALID_RESPONSE",
    message,
    details === undefined ? { httpStatus: 502 } : { details, httpStatus: 502 },
  );
}

export function validationError(message: string, details?: ErrorDetail[]): AgentError {
  return new AgentError(
    "VALIDATION_ERROR",
    message,
    details === undefined ? { httpStatus: 400 } : { details, httpStatus: 400 },
  );
}

export function notImplemented(message: string): AgentError {
  return new AgentError("NOT_IMPLEMENTED", message, { httpStatus: 501 });
}

export function notFound(message: string): AgentError {
  return new AgentError("NOT_FOUND", message, { httpStatus: 404 });
}
