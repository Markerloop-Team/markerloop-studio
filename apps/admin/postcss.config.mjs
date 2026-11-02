export default {
  // Кит приходит ПРЕКОМПИЛИРОВАННЫМ (`@markerloop/ui/ui/styles.css`, packages/ui) и здесь
  // не собирается. Плагин компилирует только src/app/globals.css — узкий
  // app-слой утилит для host-shell раскладки (SDL-226); что и почему — в
  // шапке самого globals.css.
  plugins: { "@tailwindcss/postcss": {} },
};
