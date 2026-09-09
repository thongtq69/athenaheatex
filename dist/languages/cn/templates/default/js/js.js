$(function() {

    var w = viewport().width;
    var h = viewport().height;

    $(window).resize(function() {
        w = viewport().width;
        h = viewport().height;
        if (w > 870) {
            $("#main").css({
                paddingTop: "0"
            });
            $(".asideList").show();
        } else {
            $("#main").css({
                paddingTop: "55px"
            });
            $(".asideList").hide();
            $(".asideTitle").removeClass("listslide");
            $("#menuTop").find(".active").removeClass("active");
        }
        if(w<980){$("#nav").removeClass("ft");
            if($("#menuBtn").hasClass("active")){ $("#nav").show(); }else{$("#nav").hide();}
        }
    });
    //fancybox
    $(".fancyVideo").each(function(){
        if($(this).attr("href")=="" || $(this).attr("href")==" " || $(this).attr("href")=="#"){
            $(this).removeClass("fancyVideo").addClass("fancybox").attr("title","Video will be uploaded soon").attr("href","/languages/cn/templets/default/img/logo.png");
        }
    });
        
    if ($(".fancybox").length) {
        $('.fancybox').fancybox();
    }

    var videoW = w < 600 ? w * 0.8 : w * 0.7;
    var videoH = h < 550 ? h * 0.85 : h * 0.75;

    if ($(".fancyVideo").length) {
        $(".fancyVideo").fancybox({
            'width': videoW,
            'height': videoH,
            'autoScale': true,
            'transitionIn': 'none',
            'transitionOut': 'none',
            'type': 'iframe'
        });
    }

    $(".tel-number").each(function(){
        var teltemp=$(this).attr("title");
        $(this).attr("href","tel:"+teltemp);
    });

    $("table").each(function(){
        var tabletext=$(this).html();
        tabletext=tabletext.replace(/&nbsp;/g, " ");
        $(this).html(tabletext);
    });

    $(".clickbtn").click(function(){
        $(this).parent().find("li:gt(1)").slideToggle().parent().siblings().find("li:gt(1)").slideUp();
    });

    //nav
    $("#menuBtn").click(function() {
        $("#nav").slideToggle();
        $("#menuBtn").toggleClass("active");
    });

    $(".smartmenu ul li").hover(function() {
        $(this).children('ul').css('display', 'block');
    }, function() {
        $(this).children('ul').css('display', 'none');
    });

    //Tab切换
    $("#tags li").eq(0).addClass("selectTag").siblings().removeClass("selectTag");
    $("#tagContent .tagContent").eq(0).show().siblings().hide();
    $("#tags li").click(function() {
        $(this).addClass("selectTag").siblings().removeClass("selectTag");
        var num = $("#tags li").index($(this));
        $("#tagContent .tagContent").eq(num).show().siblings().hide();
    });


    //IE8 & Table
    var ieV = $.browser.msie && $.browser.version;
    if (ieV < 9) {
        $(".container").css("min-width", "1320px"); ieV = false;
        $(".menuSub li:last").addClass("noAfter");
    } else {ieV = true; }

    if ($(".footable").length && ieV) {
        $(".footable").footable({
            breakpoints: {
                phone: 480,
                tablet: 660
            }
        });
    }

    //footer tool
    $(".footerBarPro").click(function() {
        $(".toolMask").addClass("moveLeft");
        $("body").addClass("clear");
    });

    $("#toolCloseBtn").click(function() {
        $(".toolMask").removeClass("moveLeft");
        $("body").removeClass("clear");
    });

    $("#footerBarClose").click(function() {
        $("#footerToolBar").toggleClass("close");
        $("#footer").toggleClass("close");
    });

    $(".asideWrap .asideTitle").click(function() {
        var $listSlide = $(this).next("ul");
        var listNum = $listSlide.find(">li").length;
        var listH;
        if (w <= 870 && listNum) {
            $(this).toggleClass("listslide");
            if ($(this).hasClass("listslide")) {

                $("#main").animate({paddingTop: 40 * listNum + 67 });
                $listSlide.slideDown(function() {listH = $listSlide.outerHeight() + 67; $("#main").animate({paddingTop: listH }) });
            } else {
                $listSlide.slideUp();
                $("#main").animate({paddingTop: "55px"});
            }
        }
    });

    $("#aside>.asideTitle").click(function() {
        $(this).next("ul").slideToggle();
         $(this).toggleClass("listslide");
    });

    $(".asideList>li").each(function(){
        if(!$(this).find("ul").length){
            $(this).find("ul").remove();
        }
    });

    $(".asideList>li>a").click(function(e){
        if($(this).next("ul").find("li").length && isMobile.any || w<=850 && $(this).next("ul").find("li").length){
            e.preventDefault();
            $(this).parent("li").toggleClass("selected").siblings("li").removeClass("selected").find("ul").slideUp();
            $(this).next("ul").slideToggle();
        }
    });

    //img list
    $(".spec-list img").each(function() {
        if ($(this).attr("src") == "" || $(this).attr("src") == " ") {
            $(this).parent().remove();
        }
    });
    $(".spec-list img").bind("mouseover", function() {
        var src = $(this).attr("data-img");
        $("#proimg img").eq(0).attr({
            src: src.replace("\/n5\/", "\/n1\/")
        });
    });

    $(".listStyle>li").each(function() {
        var l = $(this).find("li").length;
        if (l) {
            $(this).addClass("hasUl");

            $(this).find(">a").click(function(e) {
                e.preventDefault();
                $(this).parent("li").toggleClass("selected").siblings(".listStyle>li").removeClass("selected").find("ul").slideUp();
                $(this).next("ul").slideToggle();
            });
        } else {
            $(this).find("ul").hide();
        }
    });

    //aside a
    var nowpos = $("#nowpos").val();
    $("#aside .asideList a").each(function(){
        if($(this).attr("accesskey")==nowpos){
            $(this).addClass("selected");
            if($(this).parent().parents("li").length){
                $(this).parent().parents("li").find(">a").addClass("selected");
            }
        }
    });

    var typepos = parseInt($("#typepos").val());
    $("#nav>ul>li").each(function(){
        if($(this).attr("accesskey")==typepos){
            $(this).addClass("selected");
        }
        if(!$(this).find("ul").find("li").length){
            $(this).find("ul").remove();
        }
    });


    //scroll to
    if(w<750 && $("#location").length){
        $.scrollTo('#location',800);
    }

    if(w<980 && w>870){$("#nav").css("position","static")};

    $(window).scroll(function(){
        if ($(window).scrollTop()>200){
            $("#goTop").fadeIn();
        } else{
            $("#goTop").fadeOut();
        }
        if ($(window).scrollTop()>230 && w>=980){
            if($("#nav").css("position")!="fixed" ){
                $("#nav").css({display:"none"}).fadeIn().addClass("ft");
            }
        } else{
            $("#nav").removeClass("ft");
        }
    });

    $("#goTop").click(function(){
        $('body,html').animate({scrollTop:0},400);
        return false;
    });

    //页面中所有input textarea文本函数
    $(window.document).find("textarea").each(function() {
        bind($(this));
        if ($(this).val() != "") {
            $(this).addClass("focusOn");
        }
    });

    $(window.document).find("input").each(function() {
        bind($(this));
        if ($(this).val() != "") {
            $(this).addClass("focusOn");
        }
    });

    function bind(e) {
        var tempstr;
        e.bind({
            'focus': function() {
                e.addClass("focusOn");
            },
            'blur': function() {
                if (e.val() == "") {
                    e.removeClass("focusOn");
                } else if (e.val() != "") {
                    e.addClass("focusOn");
                    return;
                }
            }
        });
    }

});

function viewport(){
    var e = window , a = 'inner';
    if ( !( 'innerWidth' in window ) ) {
        a = 'client';
        e = document.documentElement || document.body;
    }
    return { width : e[ a+'Width' ] , height : e[ a+'Height' ] }
}

(function(i){var e=/iPhone/i,n=/iPod/i,o=/iPad/i,t=/(?=.*\bAndroid\b)(?=.*\bMobile\b)/i,r=/Android/i,d=/BlackBerry/i,s=/Opera Mini/i,a=/IEMobile/i,b=/(?=.*\bFirefox\b)(?=.*\bMobile\b)/i,h=RegExp("(?:Nexus 7|BNTV250|Kindle Fire|Silk|GT-P1000)","i"),c=function(i,e){return i.test(e)},l=function(i){var l=i||navigator.userAgent;this.apple={phone:c(e,l),ipod:c(n,l),tablet:c(o,l),device:c(e,l)||c(n,l)||c(o,l)},this.android={phone:c(t,l),tablet:!c(t,l)&&c(r,l),device:c(t,l)||c(r,l)},this.other={blackberry:c(d,l),opera:c(s,l),windows:c(a,l),firefox:c(b,l),device:c(d,l)||c(s,l)||c(a,l)||c(b,l)},this.seven_inch=c(h,l),this.any=this.apple.device||this.android.device||this.other.device||this.seven_inch},v=i.isMobile=new l;v.Class=l})(window);