<template>
  <div>
    <div v-for="anime in animes" :key="anime.id" class="anime-item">
      <h3>{{ anime.customName || anime.title }}</h3>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AnimeList',
  props: {
    animes: {
      type: Array,
      required: true
    }
  }
}
</script>