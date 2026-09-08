function normalizeLabel(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function enhanceActionCell(cell, label) {
  if (label.toLocaleLowerCase('pt-BR') !== 'ações') return;
  cell.dataset.mobileActions = 'true';
  if (cell.querySelector(':scope > .table-action-group')) return;

  const elementChildren = [...cell.children];
  if (elementChildren.length === 1 && elementChildren[0].querySelector('button')) {
    elementChildren[0].classList.add('table-action-group');
    return;
  }

  const group = document.createElement('div');
  group.className = 'table-action-group';
  while (cell.firstChild) group.append(cell.firstChild);
  cell.append(group);
}

function enhanceTable(table) {
  if (!(table instanceof HTMLTableElement)) return;

  const labels = [...table.querySelectorAll('thead th')].map((cell) =>
    normalizeLabel(cell.textContent || cell.getAttribute('aria-label') || '')
  );
  if (labels.length === 0) return;
  table.querySelectorAll('thead th').forEach((header) => header.setAttribute('scope', 'col'));

  table.querySelectorAll('tbody tr').forEach((row) => {
    [...row.cells].forEach((cell, index) => {
      if (cell.colSpan > 1) {
        cell.dataset.mobileSpan = 'true';
        return;
      }
      const label = labels[index] || '';
      if (label) {
        cell.dataset.label = label;
        enhanceActionCell(cell, label);
      }
    });
  });
  table.dataset.responsiveReady = 'true';
}

export function enhanceResponsiveTables(node) {
  if (!(node instanceof Element)) return;
  if (node.matches('table.table, table.backup-table')) enhanceTable(node);
  node.querySelectorAll('table.table, table.backup-table').forEach(enhanceTable);
}

export function installResponsiveTables(root) {
  if (!root) return () => {};
  enhanceResponsiveTables(root);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target instanceof HTMLTableSectionElement) {
        enhanceTable(mutation.target.closest('table'));
      }
      mutation.addedNodes.forEach(enhanceResponsiveTables);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
