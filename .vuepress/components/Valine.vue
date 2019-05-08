<template>
  <div id="vcomments"></div>
</template>

<script>
export default {
  name: 'Valine',
  mounted: function(){
    // require window 
    const Valine = require('valine');
    if (typeof window !== 'undefined') {
      this.window = window
      window.AV = require('leancloud-storage')
      
    }
     
    new Valine({
      el: '#vcomments' ,
      appId: 'JsbIEIrpTtaEWhGXAC4vGHWm-gzGzoHsz',// your appId
      appKey: '3M0AXkI6H2vjBtjELX0gPfHR', // your appKey
      notify: false, 
      verify: true, 
      avatar:'mm', 
      placeholder: '请发表你的看法(支持markdown)' 
    });
  },
}
</script>