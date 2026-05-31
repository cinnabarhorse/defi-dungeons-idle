import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfills required by Next.js/whatwg
if (!(global as any).TextEncoder) {
  (global as any).TextEncoder = TextEncoder as any;
}
if (!(global as any).TextDecoder) {
  (global as any).TextDecoder = TextDecoder as any;
}

// Silence console noise in tests
const originalError = console.error;
console.error = (...args: any[]) => {
  const first = String(args[0] ?? '');
  if (
    /Warning: (act\(|An update to|Received `true` for a non-boolean attribute)/.test(
      first
    )
  ) {
    return;
  }
  originalError(...args);
};
