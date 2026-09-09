// 检查当前页面是否通过HTTPS加载

$(function() {

    if($(document.body).width() < 768) {
		$(".mo-header-menu").click(function(){
			$(".mo-leftmenu").toggleClass("menu-transitioning");
		});
		$(".down-btn").on('click',function(){
			$(this).siblings('ul').slideToggle();
			return false;
		});
		$(".header-lang").hover(function(){
			$(this).find("ul").show();
		},function(){
			$(this).find("ul").hide();
		});
		$('.left_menu .asideTitle').click(function(){
			if( $(this).siblings('ul').is(':hidden') ) {
				$(this).addClass('active').siblings('ul').slideDown(); 
			} else{
				$(this).removeClass('active').siblings('ul').slideUp();
			}
		});
		$('.left_nav h3').click(function(){
			if( $(this).siblings('dl').is(':hidden') ) {
				$(this).addClass('active').siblings('dl').slideDown(); 
			} else{
				$(this).removeClass('active').siblings('dl').slideUp();
			}
		});
	};
	
    var w = viewport().width;
    var h = viewport().height;
	

    $("table").each(function(){
        var tabletext=$(this).html();
        tabletext=tabletext.replace(/&nbsp;/g, " ");
        $(this).html(tabletext);
    });

    $(".footPro .list").hover(function(){
		$(this).addClass('active');
	},function(){
		$(this).removeClass('active');
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

    var typepos = parseInt($("#typepos").val());
    $("#nav>ul>li").each(function(){
        if($(this).attr("accesskey")==typepos){
            $(this).addClass("selected");
        }
        if(!$(this).find("ul").find("li").length){
            $(this).find("ul").remove();
        }
    });

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

});

function viewport(){
    var e = window , a = 'inner';
    if ( !( 'innerWidth' in window ) ) {
        a = 'client';
        e = document.documentElement || document.body;
    }
    return { width : e[ a+'Width' ] , height : e[ a+'Height' ] }
}