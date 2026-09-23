/**
 * Incrementally removes model reasoning blocks without losing ordinary text
 * when an SSE stream ends between possible tag characters.
 */
export function createThinkStripper() {
  const OPEN = '<think>';
  const CLOSE = '</think>';
  let inside = false;
  let carry = '';

  function push(chunk: string): string {
    let buffer = carry + chunk;
    carry = '';
    let visible = '';

    while (buffer.length > 0) {
      if (!inside) {
        const open = buffer.indexOf(OPEN);
        if (open === -1) {
          const keep = Math.max(0, buffer.length - (OPEN.length - 1));
          visible += buffer.slice(0, keep);
          carry = buffer.slice(keep);
          break;
        }
        visible += buffer.slice(0, open);
        buffer = buffer.slice(open + OPEN.length);
        inside = true;
        continue;
      }

      const close = buffer.indexOf(CLOSE);
      if (close === -1) {
        const keep = Math.max(0, buffer.length - (CLOSE.length - 1));
        carry = buffer.slice(keep);
        break;
      }
      buffer = buffer.slice(close + CLOSE.length);
      inside = false;
    }

    return visible;
  }

  function flush(): string {
    const visible = inside ? '' : carry;
    carry = '';
    return visible;
  }

  return { push, flush };
}
