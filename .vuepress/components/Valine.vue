<template>
  <div id="vcomments"></div>
</template>
<script>
export default {
  name: 'Valine',
   watch: {
    $route (to, from) {
      if (from.path != to.path) {
        this.initValine()
      }
    }
  },
  methods: {
    initValine () {
      const path = location.origin + location.pathname
      this.valine.init({
        el: '#vcomments',
        appId: 'JsbIEIrpTtaEWhGXAC4vGHWm-gzGzoHsz',// your appId
        appKey: '3M0AXkI6H2vjBtjELX0gPfHR', // your appKey
        notify: false, 
        verify: true, 
        avatar:'wavatar', 
        placeholder: '请发表你的看法(支持markdown)',
        path: path,
        visitor: true
      });
    }
  },
  mounted: function(){
    // require window 
    const Valine = require('valine');
    if (typeof window !== 'undefined') {
      this.window = window
      window.AV = require('leancloud-storage')
      
    }
     
    this.valine = new Valine()
    this.initValine()
  },
}
</script>