// ctx 是 apply(ctx) 的参数，组件渲染时不在作用域内；用模块级引用转交。
// （styles / host / React 是 client 求值环境提供的全局，ctx 不是。）
let ctxRef = null

