<template>
  <div >
    <section>  
      <div id="vcomments"></div>
       <!-- id 将作为查询条件 -->
        <span class="leancloud-visitors"
              data-flag-title="Your Article Title">
          <em class="post-meta-item-text">阅读量： </em>
          <i class="leancloud-visitors-count"></i>
        </span>
    </section>
  </div>
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
      let path = location.origin + location.pathname
      // vuepress打包后变成的HTML不知为什么吞掉此处的绑定`:id="countId"`
      document.getElementsByClassName('leancloud-visitors')[0].id = path
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