import type { Config } from 'tailwindcss'
import PrimeUI from 'tailwindcss-primeui'

export default <Partial<Config>>{
  content: [
    './app/**/*.{vue,js,ts}',
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.{vue,js,ts}',
    './pages/**/*.{vue,js,ts}',
    './plugins/**/*.{js,ts}',
    './nuxt.config.{js,ts}',
  ],
  /** Утилиты с префиксом `dark:` (не `dark-mode:`) применяются при `class="dark-mode"` на `<html>`. */
  darkMode: ['selector', '[class~="dark-mode"]'],
  plugins: [PrimeUI],
}

