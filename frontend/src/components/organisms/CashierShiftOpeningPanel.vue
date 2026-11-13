<script setup lang="ts">
import { Clock3, Coins, WalletCards } from 'lucide-vue-next'

withDefaults(defineProps<{
  cashierName: string
  openingCash: number
  note: string
  busy?: boolean
}>(), { busy: false })
const emit = defineEmits<{
  'update:openingCash': [value: number]
  'update:note': [value: string]
  submit: []
}>()
</script>

<template>
  <article class="panel shift-opening-panel">
    <div class="shift-opening-icon"><Clock3 :size="27" /></div>
    <div class="shift-opening-copy">
      <span class="modal-kicker">OPERASIONAL KASIR</span>
      <h2>Buka shift sebelum mulai berjualan</h2>
      <p>Modal awal adalah uang tunai di laci kas saat shift dimulai. Sistem akan merekam kasir pembuka, waktu, dan jumlah modal.</p>
    </div>
    <form class="shift-open-form" @submit.prevent="emit('submit')">
      <label>Kasir bertugas<input :value="cashierName" disabled /></label>
      <label>Modal kas awal (Rp)<input :value="openingCash" type="number" min="0" max="1000000000" step="1000" required @input="emit('update:openingCash', Number(($event.target as HTMLInputElement).value))" /></label>
      <label>Catatan pembukaan<input :value="note" maxlength="240" placeholder="Contoh: modal awal pagi" @input="emit('update:note', ($event.target as HTMLInputElement).value)" /></label>
      <button class="btn btn-primary btn-lg" type="submit" :disabled="busy"><span v-if="busy" class="spinner"></span><WalletCards v-else :size="17" /> {{ busy ? 'Membuka shift…' : 'Buka shift kasir' }}</button>
    </form>
    <div class="shift-default-hint"><Coins :size="15" /> Nilai awal otomatis Rp500.000, bisa disesuaikan dengan uang yang benar-benar diterima kasir.</div>
  </article>
</template>
