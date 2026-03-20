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
  darkMode: ['selector', '[class~="dark-mode"]'],
  plugins: [PrimeUI],
}

