<script setup lang="ts">
import { ShoppingBag } from 'lucide-vue-next'
withDefaults(defineProps<{ size?: number }>(), { size: 22 })
</script>

<template>
  <span class="brand-mark" aria-hidden="true"><ShoppingBag :size="size" /></span>
</template>
