// Northwind Coffee: a tiny client-side routed shop used to demo Optic. Routing uses
// history.pushState, which also exercises the tracker's single-page-app pageview tracking.
(function () {
  var PRODUCTS = [
    { slug: "ethiopia-yirgacheffe", name: "Ethiopia Yirgacheffe", origin: "Ethiopia", roast: "Light", price: 18, emoji: "🌸", color: "#f6dfe4", notes: ["Jasmine", "Bergamot", "Peach"] },
    { slug: "colombia-huila", name: "Colombia Huila", origin: "Colombia", roast: "Medium", price: 16, emoji: "🍫", color: "#ead7c3", notes: ["Milk chocolate", "Red apple", "Caramel"] },
    { slug: "sumatra-mandheling", name: "Sumatra Mandheling", origin: "Indonesia", roast: "Dark", price: 17, emoji: "🌿", color: "#d9e4d2", notes: ["Cedar", "Dark cocoa", "Earthy"] },
    { slug: "kenya-aa", name: "Kenya AA", origin: "Kenya", roast: "Light", price: 21, emoji: "🍒", color: "#f3d6d0", notes: ["Blackcurrant", "Grapefruit", "Juicy"] },
    { slug: "house-espresso", name: "House Espresso", origin: "Blend", roast: "Medium-dark", price: 15, emoji: "☕", color: "#e6d3bd", notes: ["Hazelnut", "Toffee", "Syrupy"] },
    { slug: "decaf-swiss-water", name: "Decaf Swiss Water", origin: "Peru", roast: "Medium", price: 17, emoji: "🌙", color: "#dcdcef", notes: ["Brown sugar", "Almond", "Smooth"] },
  ];
  var app = document.getElementById("app");
  var cart = load();
  // In a heatmap preview, show the cart with one item so the layout matches what visitors saw.
  if (/[?&]optic_preview=1/.test(location.search) && /\/(cart|checkout)$/.test(location.pathname) && !cart.length) cart = [{ slug: "colombia-huila", qty: 1 }];

  function load() { try { return JSON.parse(sessionStorage.getItem("nw_cart") || "[]"); } catch (e) { return []; } }
  function save() { try { sessionStorage.setItem("nw_cart", JSON.stringify(cart)); } catch (e) {} document.getElementById("cart-count").textContent = cart.reduce(function (a, i) { return a + i.qty; }, 0); }
  function money(n) { return "$" + n.toFixed(2); }
  function find(slug) { return PRODUCTS.filter(function (p) { return p.slug === slug; })[0]; }
  function total() { return cart.reduce(function (a, i) { return a + find(i.slug).price * i.qty; }, 0); }
  function card(p) {
    return '<a class="card" href="/demo/product/' + p.slug + '" data-link><div class="art" style="background:' + p.color + '">' + p.emoji + '</div><div class="body"><h3>' + p.name + '</h3><div class="meta">' + p.origin + " · " + p.roast + ' roast</div><div class="price">' + money(p.price) + "</div></div></a>";
  }

  var views = {
    home: function () {
      return '<section class="hero"><div><h1>Small-batch coffee, roasted the week you order it.</h1><p>Single origins and a house espresso, shipped fresh from our roastery.</p><a class="btn" id="hero-shop" href="/demo/shop" data-link>Shop coffee</a><a class="btn secondary" href="/demo/brewing-guide" data-link>How to brew</a></div><div class="art" style="background:#ead7c3">☕</div></section>' +
        "<h2>Bestsellers</h2><div class=\"grid\">" + PRODUCTS.slice(0, 3).map(card).join("") + "</div>" +
        '<section class="features"><div><b>Roasted to order</b>Every bag ships within 48 hours of roasting.</div><div><b>Free shipping over $40</b>Anywhere in the country, no code needed.</div><div><b>Brew support</b>Grind sizes and ratios for every method.</div></section>';
    },
    shop: function () { return "<h2>All coffee</h2><div class=\"grid\">" + PRODUCTS.map(card).join("") + "</div>"; },
    product: function (slug) {
      var p = find(slug);
      if (!p) return '<div class="done"><h2>Not found</h2><a class="btn" href="/demo/shop" data-link>Back to shop</a></div>';
      return '<div class="product"><div class="art" style="background:' + p.color + '">' + p.emoji + '</div><div><div class="meta">' + p.origin + " · " + p.roast + " roast</div><h1>" + p.name + '</h1><div class="price" style="font-size:24px;font-weight:700">' + money(p.price) + ' <span class="meta" style="font-size:15px;font-weight:400">/ 340g</span></div><div class="notes">' + p.notes.map(function (n) { return "<span>" + n + "</span>"; }).join("") + '</div><p>Roasted in small batches and rested for flavour. Great as pour-over, in a French press or as espresso.</p><div class="qty"><label for="qty">Qty</label><select id="qty"><option>1</option><option>2</option><option>3</option></select><select id="grind"><option>Whole bean</option><option>Filter grind</option><option>Espresso grind</option></select></div><button class="btn block" id="add-to-cart" data-slug="' + p.slug + '">Add to cart</button></div></div>';
    },
    cart: function () {
      if (!cart.length) return '<div class="done"><div class="art">🛒</div><h2>Your cart is empty</h2><a class="btn" href="/demo/shop" data-link>Shop coffee</a></div>';
      var rows = cart.map(function (i) { var p = find(i.slug); return '<div class="cart-row"><div class="art" style="background:' + p.color + '">' + p.emoji + "</div><div><b>" + p.name + '</b><div class="meta">' + i.qty + " × " + money(p.price) + "</div></div><div>" + money(p.price * i.qty) + '</div><button class="btn secondary remove" data-slug="' + p.slug + '" style="padding:6px 12px">Remove</button></div>'; }).join("");
      // The coupon "button" is a span with no handler: a real bug for Optic's rage and dead click detection to find.
      return "<h2>Your cart</h2>" + rows + '<div class="summary"><div class="coupon"><input placeholder="Coupon code" id="coupon" /><span class="apply" id="apply-coupon">Apply</span></div><div class="line"><span>Subtotal</span><b>' + money(total()) + '</b></div><div class="line"><span>Shipping</span><span>' + (total() >= 40 ? "Free" : money(5)) + '</span></div><a class="btn block" id="checkout-btn" href="/demo/checkout" data-link style="margin-top:12px">Checkout</a></div>';
    },
    checkout: function () {
      if (!cart.length) return views.cart();
      return '<div class="checkout"><form id="checkout-form"><h2>Checkout</h2><div class="field"><label>Email</label><input type="email" required value="" placeholder="you@example.com" /></div><div class="two"><div class="field"><label>First name</label><input required /></div><div class="field"><label>Last name</label><input required /></div></div><div class="field"><label>Address</label><input required /></div><div class="two"><div class="field"><label>City</label><input required /></div><div class="field"><label>Postcode</label><input required /></div></div><div class="field"><label>Card number</label><input inputmode="numeric" placeholder="4242 4242 4242 4242" required /></div><button class="btn block" id="pay" type="submit">Pay ' + money(total() + (total() >= 40 ? 0 : 5)) + '</button></form><div class="summary" style="margin:0"><b>Order summary</b>' + cart.map(function (i) { var p = find(i.slug); return '<div class="line"><span>' + i.qty + " × " + p.name + "</span><span>" + money(p.price * i.qty) + "</span></div>"; }).join("") + "</div></div>";
    },
    thanks: function () { return '<div class="done"><div class="art">🎉</div><h2>Thanks for your order!</h2><p>We roast it tomorrow and ship it the day after.</p><a class="btn" href="/demo/shop" data-link>Keep shopping</a></div>'; },
    guide: function () {
      return '<article class="article"><h1>The Northwind brewing guide</h1><p>Good coffee is mostly ratio, grind and water temperature. Start here and adjust to taste.</p><h2>Pour-over</h2><ul><li>15 g coffee to 250 g water (1:16)</li><li>Medium-fine grind, like sea salt</li><li>Water at 93°C, total time about 3 minutes</li></ul><h2>French press</h2><ul><li>30 g coffee to 500 g water</li><li>Coarse grind</li><li>Steep 4 minutes, then press slowly</li></ul><h2>Espresso</h2><ul><li>18 g in, 36 g out, in 25 to 30 seconds</li></ul><p><a class="btn" href="/demo/brew-guide.pdf" id="download-guide" download>Download the printable guide (PDF)</a></p><p>Want to go deeper? Read the <a href="https://en.wikipedia.org/wiki/Coffee_preparation" target="_blank" rel="noopener" id="wiki-link">coffee preparation article on Wikipedia</a>.</p></article>';
    },
    about: function () {
      return '<article class="article"><h1>About Northwind</h1><p>We started roasting in a garage in 2019. Today we buy directly from eleven farms and roast six days a week.</p><div class="video"><video id="roastery-video" controls preload="none" title="Inside the roastery" poster="/demo/poster.svg" src="/demo/roastery.mp4"></video></div><p>Every bag carries its roast date. If it is older than three weeks when it reaches you, we will replace it.</p></article>';
    },
  };

  function route() {
    var path = location.pathname.replace(/\/+$/, "") || "/demo";
    var m;
    var html;
    if (path === "/demo" || path === "/demo/index.html") html = views.home();
    else if (path === "/demo/shop") html = views.shop();
    else if ((m = path.match(/^\/demo\/product\/([\w-]+)$/))) html = views.product(m[1]);
    else if (path === "/demo/cart") html = views.cart();
    else if (path === "/demo/checkout") html = views.checkout();
    else if (path === "/demo/thank-you") html = views.thanks();
    else if (path === "/demo/brewing-guide") html = views.guide();
    else if (path === "/demo/about") html = views.about();
    else html = views.home();
    app.innerHTML = html;
    var p = m && find(m[1]);
    document.title = (p ? p.name + " — " : "") + "Northwind Coffee";
    window.scrollTo(0, 0);
    if (path === "/demo/checkout") optic("event", "begin_checkout", { items: cart.length, value: total() });
  }

  function go(href) { history.pushState({}, "", href); route(); }

  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-link]");
    if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute("href")); return; }
    var add = e.target.closest("#add-to-cart");
    if (add) {
      var slug = add.getAttribute("data-slug"), qty = +document.getElementById("qty").value, p = find(slug);
      var line = cart.filter(function (i) { return i.slug === slug; })[0];
      if (line) line.qty += qty; else cart.push({ slug: slug, qty: qty });
      save();
      optic("event", "add_to_cart", { item: p.name, price: p.price, qty: qty });
      add.textContent = "Added ✓";
      setTimeout(function () { go("/demo/cart"); }, 400);
    }
    var rm = e.target.closest(".remove");
    if (rm) { cart = cart.filter(function (i) { return i.slug !== rm.getAttribute("data-slug"); }); save(); route(); }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id !== "checkout-form") return;
    e.preventDefault();
    var value = total() + (total() >= 40 ? 0 : 5);
    // Roughly one checkout in twelve hits a bug in the "shipping estimate" code.
    if (Math.random() < 0.08) { setTimeout(function () { var est = undefined; est.price.toFixed(2); }, 0); }
    optic("purchase", value, { order_id: "NW-" + Math.floor(Math.random() * 1e6), items: cart.map(function (i) { return find(i.slug).name; }).join(", "), item: find(cart[0].slug).name });
    cart = [];
    save();
    go("/demo/thank-you");
  });

  window.addEventListener("popstate", route);
  save();
  route();
})();
