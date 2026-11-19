<template>
  <!--
    A4 document geometry is the one sanctioned arbitrary value
    (docs/design.md §3.3): 210 mm column with 18 mm margins, no app chrome.
  -->
  <!-- A4 geometry applies to the printed/previewed document; on narrow
       screens the sheet shrinks to the viewport with lighter margins. -->
  <div class="mx-auto w-full max-w-full p-5 sm:w-[210mm] sm:p-[18mm]">
    <slot />
  </div>
</template>
