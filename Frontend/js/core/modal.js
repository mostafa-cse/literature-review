/**
 * LITNEXIS UNIVERSAL MODAL ENGINE
 * Manages modal visibility, autofocus, scroll locking, and outside/escape dismissal.
 */

window.openModal = function(modalId) {
  let modal = document.getElementById(modalId);
  if (!modal && !modalId.endsWith('-overlay')) {
    modal = document.getElementById(modalId + '-overlay');
  }
  if (!modal) {
    console.warn(`[Modal] Modal with ID "${modalId}" not found.`);
    return;
  }
  modal.classList.add('open');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Auto-focus first visible input
  const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 80);
  }
};

window.closeModal = function(modalId) {
  let modal = document.getElementById(modalId);
  if (!modal && !modalId.endsWith('-overlay')) {
    modal = document.getElementById(modalId + '-overlay');
  }
  if (!modal) return;
  modal.classList.remove('open');
  modal.classList.remove('active');

  const openModals = document.querySelectorAll('.modal-overlay.open, .modal-overlay.active');
  if (openModals.length === 0) {
    document.body.style.overflow = '';
  }
};

// Global Backdrop and Keyboard Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Backdrop click dismissal
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('modal-overlay')) {
      const modalId = e.target.id;
      if (modalId) {
        window.closeModal(modalId);
      }
    }
  });

  // Escape key dismissal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal-overlay.open');
      openModals.forEach(m => {
        if (m.id) window.closeModal(m.id);
      });
    }
  });
});
