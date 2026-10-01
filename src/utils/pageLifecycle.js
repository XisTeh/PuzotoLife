export function getActivePageRoot() {
  return document.getElementById('pageContent')?.firstElementChild || null;
}

export function isActivePageRoot(root) {
  return Boolean(root?.isConnected && root.parentElement?.id === 'pageContent');
}
