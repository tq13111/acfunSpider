require('./mongoose_service');
const axios = require('axios');
const cherrio = require('cheerio');
const RedisService = require('./content_id_service');
const moment = require('moment');
// const jieba = require('nodejieba');

const Article = require('../models/article');

class Tag {
  constructor(name, value, score) {
    this.name = name;
    this.value = value;
    this.score = score;
  }
}

async function spideringArticles(count) {
  const ids = await RedisService.getRandomAcfunIds(count);
  let succeedCount = 0;
  let errCount = 0;
  for (let id of ids) {
    console.log(id,'id')
    await getSingleArticle(id)
      .then((e) => {
        succeedCount += 1;
      })
      .catch(e => {
        errCount += 1;
        if (e.errorCode !== 4040000) throw e;
      });
    await new Promise((rsv) => {
      setTimeout(rsv, 1000);
    });
  }
  return {
    succeedCount,
    errCount,
  };
}

async function getSingleArticle(id) {
  // 设置全局请求头
  const url = `https://www.acfun.cn/a/ac${id}`;
  // const url = `http://localhost:3000/users`;
  const res = await axios.get(url)
    .catch(e => {
      if (e.response && e.response.status && e.response.status == 404) {
        const err = new Error('Not Found');
        err.errorCode = 4040000;
        throw err;
      } else {
        throw e;
      }
    });
  const html = res.data;
  const $ = cherrio.load(html);

  const articleContent = $('.article-content');
  console.log(articleContent,1)
  console.log(articleContent.html(),2)

  const tags = [];

  const title = $('.art-title')
    .children('.art-title-head')
    .children('.caption')
    .text();
  // const titleTags = jieba.extract(title, 5);

  // for (const t of titleTags) {
  //   tags.push(new Tag('ARTICLE_TAG_TITLE', t.word, t.weight));
  // }

  const originCreatedAt = moment($('.up-time').text(), 'YYYY年MM月DD日   hh:mm:ss')
    .valueOf();

  const articleTagName = $('.art-name').text();

  tags.push(new Tag('ARTICLE_TAG_NAME', articleTagName, 1));

  const articleCategory = $('.art-census > a').text();

  tags.push(new Tag('ARTICLE_CATEGORY', articleCategory, 1));

  const tagSys = $('.art-tags > a').text();

  tags.push(new Tag('ARTICLE_TAG_SYS', tagSys, 1));

  // const tagHttpRes = await axios.get(
  //   `http://www.acfun.cn/member/collect_up_exist.aspx?contentId=${id}`);
  //
  // const tagList = tagHttpRes.data.data.tagList;

  // for (let tag of tagList) {
  //   tags.push(new Tag('ARTICLE_TAG_USER', tag.tagName, 1));
  // }
  if (!articleContent) {
    return;
  } else {
    await RedisService.markArticleIdSucceed(id);
  }

  const dom = $(articleContent);

  const content = getTextOrImg(dom, []);

  function getTextOrImg(dom, arr) {
    const d = $(dom);
    const children = d.children();
    if (d.text()) {
      arr.push(d.text());
    }
    if (children.length === 0) {
      if (d['0'].name === 'img') {
        arr.push(d.attr('src'));
      }
    } else {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        getTextOrImg(child, arr);
      }
    }
    console.log(arr,'arr')
    return arr;
  }

  const article = {
    acfunId: id,
    content: content,
    articleContentHtml: articleContent.html(),
    createdAt: Date.now().valueOf(),
    originCreatedAt: originCreatedAt,
    title: title,
    tags: tags,
  };
  console.log(article,'article')

  const result = await Article.model.findOneAndUpdate(
    {
      acfunId: id,
    },
    article,
    {
      upsert: true,
      returnNewValue: true,
    });
  console.log(result,'result')
  return result;
}

module.exports = {
  spideringArticles,
  getSingleArticle,
};
