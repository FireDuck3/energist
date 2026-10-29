// Тимчасова заглушка — екран з'явиться в наступному завданні плану.
import { h } from '../ui.js';

export function render(_params, root) {
  root.append(h('section', { class: 'section' }, h('div', { class: 'container' }, h('h1', {}, 'Калькулятор'))));
}
