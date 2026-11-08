<template>
  <!--
    A4 document geometry is the one sanctioned arbitrary value
    (docs/design.md §3.3): 210 mm column with 18 mm margins, no app chrome.
  -->
  <div class="mx-auto w-[210mm] p-[18mm]">
    <slot />
  </div>
</template>
