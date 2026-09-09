<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">

<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta content="text/html; charset=utf-8" http-equiv="Content-Type"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<meta content="IE=edge,chrome=1" http-equiv="X-UA-Compatible"/>
<meta content="IE=10" http-equiv="X-UA-Compatible"/>
<script src="/templates/default/js/jquery-1.7.2.min.js" type="text/javascript"></script>
<script type="text/javascript">
        $(function(){
            var myUrl=document.referrer || window.location.origin;
            var myUrlCode=encodeURIComponent(myUrl);
            $(".shareButtonList a").each(function(){
               var thisUrl=$(this).attr("href").replace("mySite",myUrlCode);
               $(this).attr("href",thisUrl);
            });
    });
    </script>
<style type="text/css">
        body{background-color:#EEEEEE; font-size:14px; line-height:1.2; font-family: Arial, Helvetica, Microsoft YaHei, SimSun, Sans-serif;}
        body, div,ul,li,p{ padding: 0; margin: 0; }
        a{ text-decoration:none;}
        ul, li{ list-style: none; }
        .clearfix { *zoom:1;}
        .clearfix:before , .clearfix:after{content: ""; display: table; }
        .clearfix:after{ clear: both; }
        .shareButtonList li{-moz-box-sizing:border-box; -webkit-box-sizing:border-box; -o-box-sizing:border-box; -ms-box-sizing:border-box; box-sizing:border-box;}
        .sharebox{ margin:2% auto; width:100%; max-width:540px; overflow:hidden;}
        .sharebox>p{text-align:center; color:#fff; background:#dfdfdf; font-size:20px; font-weight:bold; line-height:100px; height:100px; border:1px solid #EEEEEE; text-shadow:0px 0px 15px rgba(0,0,0,0.18);}
        .shareButtonList{border-right:1px solid #eee; }
        .shareButtonList li{ width:33.33333%; float:left; border-left:1px solid #EEEEEE; border-bottom:1px solid #EEEEEE;}
        .shareButtonList li a{ display:block; text-align:center; height:120px;}
        .shareButtonList li a:after , .shareButtonList li a img{ display:inline-block; vertical-align:middle;}
        .shareButtonList li a:after{content:''; height:100%; width:0px; overflow:hidden; }
        .shareButtonList li a img { max-width:100%; max-height:100%; }
        .shareButtonList li:hover{ opacity:0.7;}
        .shareButtonList li.fb{ background:#305891;}
        .shareButtonList li.gl{ background:#ce4d39;}
        .shareButtonList li.in{ background:#4498c8;}
        .shareButtonList li.tw{ background:#2ca8d2;}
        .shareButtonList li.pin{ background:#c82828;}
        .shareButtonList li.mail{ background:#738a8d;}
        @media screen and (max-width:750px){.sharebox{ margin:0 auto;}}
        @media screen and (max-width:450px){
        .shareButtonList li{ width:50%;}
        }
        .shareComp{ padding:20px 0; text-align:center;}
        .shareComp img{ max-width:200px; max-height:100px;}
        .shareComp p{ font-size:15px;}
        .shareComp p a{ display:inline-block; padding:8px 0; color:#888; font-weight:bold; text-transform:capitalize; }
    </style>
</head>
<body>
<div class="sharebox">
<div class="shareComp">
<img alt="" src="/templates/default/images/logo.jpg"/>
</div>
<p>Share</p>
<!-- Go to www.addthis.com/dashboard to generate a new set of buttons -->
<ul class="shareButtonList clearfix">
<li class="fb"><a href="https://api.addthis.com/oexchange/0.8/forward/facebook/offer?pco=tbxnj-1.0&amp;url=mySite&amp;pubid=ra-53e1dd8a0887cb8f&amp;ct=1" target="_blank"><img alt="Facebook" border="0" src="https://cache.addthiscdn.com/icons/v2/thumbs/32x32/facebook.png"/></a></li>
<li class="gl"><a href="https://api.addthis.com/oexchange/0.8/forward/google_plusone_share/offer?pco=tbxnj-1.0&amp;url=mySite&amp;pubid=ra-53e1dd8a0887cb8f&amp;ct=1" target="_blank"><img alt="Google+" border="0" src="https://cache.addthiscdn.com/icons/v2/thumbs/32x32/google_plusone_share.png"/></a></li>
<li class="in"><a href="https://api.addthis.com/oexchange/0.8/forward/linkedin/offer?pco=tbxnj-1.0&amp;url=mySite&amp;pubid=ra-53e1dd8a0887cb8f&amp;ct=1" target="_blank"><img alt="LinkedIn" border="0" src="https://cache.addthiscdn.com/icons/v2/thumbs/32x32/linkedin.png"/></a></li>
<li class="tw"><a href="https://api.addthis.com/oexchange/0.8/forward/twitter/offer?pco=tbxnj-1.0&amp;url=mySite&amp;pubid=ra-53e1dd8a0887cb8f&amp;ct=1" target="_blank"><img alt="Twitter" border="0" src="https://cache.addthiscdn.com/icons/v2/thumbs/32x32/twitter.png"/></a></li>
<li class="pin"><a href="https://api.addthis.com/oexchange/0.8/forward/pinterest/offer?pco=tbxnj-1.0&amp;url=mySite&amp;pubid=ra-53e1dd8a0887cb8f&amp;ct=1" target="_blank"><img alt="Pinterest" border="0" src="https://cache.addthiscdn.com/icons/v2/thumbs/32x32/pinterest.png"/></a></li>
<li class="mail"><a href="https://api.addthis.com/oexchange/0.8/forward/email/offer?pco=tbxnj-1.0&amp;url=mySite&amp;pubid=ra-53e1dd8a0887cb8f&amp;ct=1" target="_blank"><img alt="Email" border="0" src="https://cache.addthiscdn.com/icons/v2/thumbs/32x32/email.png"/></a></li>
</ul>
</div>
<script defer="True" src="/local-runtime.js"></script></body>
</html>