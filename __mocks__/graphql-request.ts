export function gql(
  strings: TemplateStringsArray | string,
  ..._values: unknown[]
): string {
  if (typeof strings === 'string') return strings;
  return strings.join('');
}

export async function request(): Promise<unknown> {
  return {};
}

export class ClientError extends Error {
  response: unknown;
  request: unknown;

  constructor(message: string, response?: unknown, request?: unknown) {
    super(message);
    this.name = 'ClientError';
    this.response = response;
    this.request = request;
  }
}

