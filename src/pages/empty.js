export function renderEmptyState(title, subtitle, icon) {
  return `
    <div class="empty-state animate-in">
      <div class="empty-state__icon-wrap">
        <i data-lucide="${icon}"></i>
      </div>
      <h2 class="empty-state__title">${title}</h2>
      <p class="empty-state__desc">${subtitle}</p>
      <div class="empty-state__badge">
        <i data-lucide="hammer"></i>
        Em desenvolvimento
      </div>
    </div>
  `;
}
