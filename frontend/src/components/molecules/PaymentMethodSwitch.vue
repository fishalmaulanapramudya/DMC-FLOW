<script setup lang="ts">
import { Banknote, QrCode } from 'lucide-vue-next'

defineProps<{ modelValue: 'cash' | 'qr_wallet' }>()
defineEmits<{ 'update:modelValue': [value: 'cash' | 'qr_wallet'] }>()
</script>

<template>
  <div class="payment-method-switch" role="group" aria-label="Metode pembayaran">
    <button type="button" :class="{ selected: modelValue === 'cash' }" :aria-pressed="modelValue === 'cash'" @click="$emit('update:modelValue', 'cash')">
      <Banknote :size="17" /> Tunai
    </button>
    <button type="button" :class="{ selected: modelValue === 'qr_wallet' }" :aria-pressed="modelValue === 'qr_wallet'" @click="$emit('update:modelValue', 'qr_wallet')">
      <QrCode :size="17" /> QR D-PAY
    </button>
  </div>
</template>
