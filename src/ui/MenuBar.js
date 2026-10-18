export function setupMenuBar() {
  const menus = [...document.querySelectorAll('#menubar .menu')];
  let anyOpen = false;

  const closeAll = () => {
    menus.forEach((menu) => menu.classList.remove('open'));
    anyOpen = false;
  };
  const open = (menu) => {
    closeAll();
    menu.classList.add('open');
    anyOpen = true;
  };

  menus.forEach((menu) => {
    const trigger = menu.querySelector('.menu-trigger');
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (menu.classList.contains('open')) closeAll();
      else open(menu);
    });
    trigger.addEventListener('mouseenter', () => anyOpen && open(menu));
  });

  document.querySelectorAll('#menubar .menu-item[data-click]').forEach((item) => {
    item.addEventListener('click', () => {
      closeAll();
      document.querySelector(item.dataset.click)?.click();
    });
  });
  document.querySelectorAll('#menubar .menu-item[data-soon]').forEach((item) => {
    item.addEventListener('click', closeAll);
  });

  document.addEventListener('click', closeAll);
  window.addEventListener('keydown', (event) => event.key === 'Escape' && closeAll());
}
