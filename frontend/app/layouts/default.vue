<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">Tournament Platform</h1>
      <nav class="app-nav">
        <NuxtLink to="/">Главная</NuxtLink>
        <NuxtLink to="/admin/login">Admin · Login</NuxtLink>
        <NuxtLink to="/admin/tournaments">Admin · Турниры</NuxtLink>
        <NuxtLink to="/demo/table">demo · Table</NuxtLink>
        <NuxtLink to="/demo/calendar">demo · Calendar</NuxtLink>
      </nav>
    </header>

    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

