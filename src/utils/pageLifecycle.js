export function getActivePageRoot() {
  const container = document.getElementById('pageContent');
  if (!container) return null;
  const ticket = container.dataset.navigationTicket;
  return {
    querySelector: selector => container.querySelector(selector),
    container,
    ticket,
  };
}

export function isActivePageRoot(root) {
  const container = document.getElementById('pageContent');
  return Boolean(root?.container?.isConnected && root.container === container && root.ticket === container.dataset.navigationTicket);
}
