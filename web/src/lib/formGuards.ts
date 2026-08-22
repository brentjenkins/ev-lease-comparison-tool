import type { KeyboardEvent } from 'react';

// These are long forms split across several visible sections — pressing Enter while
// filling in one field (a common habit moving between inputs) shouldn't submit and close
// the whole form early. Only an explicit click on the submit button should save. Enter
// still works normally inside a <textarea> (it just inserts a newline there, and never
// submits a form natively) and on the submit button itself.
export function blockEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== 'Enter') return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT') {
    e.preventDefault();
  }
}
