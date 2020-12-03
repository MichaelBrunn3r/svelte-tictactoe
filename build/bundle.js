var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src\Square.svelte generated by Svelte v3.31.0 */

    function create_fragment(ctx) {
    	let div;
    	let t;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			t = text(/*state*/ ctx[0]);
    			attr(div, "class", "square svelte-7os8ha");
    			toggle_class(div, "winner-square", /*isWinnerSquare*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t);

    			if (!mounted) {
    				dispose = listen(div, "click", /*click_handler*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*state*/ 1) set_data(t, /*state*/ ctx[0]);

    			if (dirty & /*isWinnerSquare*/ 2) {
    				toggle_class(div, "winner-square", /*isWinnerSquare*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { state } = $$props;
    	let { winner } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("winner" in $$props) $$invalidate(2, winner = $$props.winner);
    	};

    	let isWinnerSquare;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*winner, state*/ 5) {
    			 $$invalidate(1, isWinnerSquare = winner && winner === state);
    		}
    	};

    	return [state, isWinnerSquare, winner, click_handler];
    }

    class Square extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { state: 0, winner: 2 });
    	}
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    let connection;
    let connectionTimer;
    let message;

    const connect = () => {
    	try {
    		if(!connection || connection.readyState >= 2) {
    			connection = new WebSocket({"env":{"apiUrl":"https://tictactoe.noahglaser.net","wsUrl":"wss://tictactoe.noahglaser.net/ws"}}.env.wsUrl);

    			// Try ever 500ms to reconnect
    			connection.onclose = (e) => {
    				console.log(e, 'closed');
    				connectionTimer = setInterval(() => {
    					connect();
    				}, 500);
    			};

    			connection.onopen = () => {
    				clearInterval(connectionTimer);
    				console.log('connected');
    			};

    			connection.onmessage = (e) => {
    				message = e.data;
    			};
    		}
    	} catch (e) {
    		console.log(e, 'logging error');
    	}
    };

    const store = new readable(undefined, (set) => {
    	const messageTimer = setInterval(() => {
    		if(message) {
    			set(JSON.parse(message));
    			message = undefined;
    		}
    	}, 5);

    	// Clean up on unsubscribe
    	return () => {
    		if(connection) {
    			connection.close();
    		}
    		clearInterval(messageTimer);
    	}
    });

    connect();

    var gameStore = {
    	subscribe: store.subscribe,
    	isConnected: () => connection.readyState <= 1,
    	store
    };

    const nextMove = async (square_id) => {
    	try {
    		const response = await fetch(`${{"env":{"apiUrl":"https://tictactoe.noahglaser.net","wsUrl":"wss://tictactoe.noahglaser.net/ws"}}.env.apiUrl}/next-turn/${square_id}`);
    		const message = await response.json();

    		return message.errorMessage;
    	} catch (e) {
    		console.log(e);
    		return 'Error connecting to the server';
    	}
    };

    const newGame = async () => {
    	try {
    		await fetch(`${{"env":{"apiUrl":"https://tictactoe.noahglaser.net","wsUrl":"wss://tictactoe.noahglaser.net/ws"}}.env.apiUrl}/reset`);
    	} catch (e) {
    		console.log(e);
    		return 'Error connecting to the server';
    	}
    };

    var requests = {
    	nextMove,
    	newGame
    };

    /* src\App.svelte generated by Svelte v3.31.0 */

    function create_else_block(ctx) {
    	let h2;
    	let t0;
    	let t1;

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = text("Player ");
    			t1 = text(/*currentPlayer*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			append(h2, t0);
    			append(h2, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*currentPlayer*/ 2) set_data(t1, /*currentPlayer*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    // (68:18) 
    function create_if_block_3(ctx) {
    	let h2;
    	let t0;
    	let t1;
    	let t2;

    	return {
    		c() {
    			h2 = element("h2");
    			t0 = text("Player ");
    			t1 = text(/*winner*/ ctx[3]);
    			t2 = text(" won!!!");
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    			append(h2, t0);
    			append(h2, t1);
    			append(h2, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*winner*/ 8) set_data(t1, /*winner*/ ctx[3]);
    		},
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    // (66:1) {#if winner === 'TIE'}
    function create_if_block_2(ctx) {
    	let h2;

    	return {
    		c() {
    			h2 = element("h2");
    			h2.textContent = "Tie Game!!!";
    		},
    		m(target, anchor) {
    			insert(target, h2, anchor);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(h2);
    		}
    	};
    }

    // (90:1) {#if winner}
    function create_if_block_1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "New Game";
    			attr(button, "class", "svelte-17kkq72");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", /*newGame*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (94:1) {#if errorMsg}
    function create_if_block(ctx) {
    	let p;
    	let t;

    	return {
    		c() {
    			p = element("p");
    			t = text(/*errorMsg*/ ctx[4]);
    			attr(p, "class", "errorMessage svelte-17kkq72");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*errorMsg*/ 16) set_data(t, /*errorMsg*/ ctx[4]);
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let main;
    	let h1;
    	let t1;
    	let h2;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let div0;
    	let square0;
    	let t6;
    	let square1;
    	let t7;
    	let square2;
    	let t8;
    	let div1;
    	let square3;
    	let t9;
    	let square4;
    	let t10;
    	let square5;
    	let t11;
    	let div2;
    	let square6;
    	let t12;
    	let square7;
    	let t13;
    	let square8;
    	let t14;
    	let t15;
    	let current;

    	function select_block_type(ctx, dirty) {
    		if (/*winner*/ ctx[3] === "TIE") return create_if_block_2;
    		if (/*winner*/ ctx[3]) return create_if_block_3;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type(ctx);

    	square0 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][0]
    			}
    		});

    	square0.$on("click", /*click_handler*/ ctx[7]);

    	square1 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][1]
    			}
    		});

    	square1.$on("click", /*click_handler_1*/ ctx[8]);

    	square2 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][2]
    			}
    		});

    	square2.$on("click", /*click_handler_2*/ ctx[9]);

    	square3 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][3]
    			}
    		});

    	square3.$on("click", /*click_handler_3*/ ctx[10]);

    	square4 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][4]
    			}
    		});

    	square4.$on("click", /*click_handler_4*/ ctx[11]);

    	square5 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][5]
    			}
    		});

    	square5.$on("click", /*click_handler_5*/ ctx[12]);

    	square6 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][6]
    			}
    		});

    	square6.$on("click", /*click_handler_6*/ ctx[13]);

    	square7 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][7]
    			}
    		});

    	square7.$on("click", /*click_handler_7*/ ctx[14]);

    	square8 = new Square({
    			props: {
    				winner: /*winner*/ ctx[3],
    				state: /*board*/ ctx[2][8]
    			}
    		});

    	square8.$on("click", /*click_handler_8*/ ctx[15]);
    	let if_block1 = /*winner*/ ctx[3] && create_if_block_1(ctx);
    	let if_block2 = /*errorMsg*/ ctx[4] && create_if_block(ctx);

    	return {
    		c() {
    			main = element("main");
    			h1 = element("h1");
    			h1.textContent = "Tic Tac Toe";
    			t1 = space();
    			h2 = element("h2");
    			t2 = text("# people playing: ");
    			t3 = text(/*numPlayers*/ ctx[0]);
    			t4 = space();
    			if_block0.c();
    			t5 = space();
    			div0 = element("div");
    			create_component(square0.$$.fragment);
    			t6 = space();
    			create_component(square1.$$.fragment);
    			t7 = space();
    			create_component(square2.$$.fragment);
    			t8 = space();
    			div1 = element("div");
    			create_component(square3.$$.fragment);
    			t9 = space();
    			create_component(square4.$$.fragment);
    			t10 = space();
    			create_component(square5.$$.fragment);
    			t11 = space();
    			div2 = element("div");
    			create_component(square6.$$.fragment);
    			t12 = space();
    			create_component(square7.$$.fragment);
    			t13 = space();
    			create_component(square8.$$.fragment);
    			t14 = space();
    			if (if_block1) if_block1.c();
    			t15 = space();
    			if (if_block2) if_block2.c();
    			attr(div0, "class", "row svelte-17kkq72");
    			attr(div1, "class", "row svelte-17kkq72");
    			attr(div2, "class", "row svelte-17kkq72");
    			attr(main, "class", "svelte-17kkq72");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, h1);
    			append(main, t1);
    			append(main, h2);
    			append(h2, t2);
    			append(h2, t3);
    			append(main, t4);
    			if_block0.m(main, null);
    			append(main, t5);
    			append(main, div0);
    			mount_component(square0, div0, null);
    			append(div0, t6);
    			mount_component(square1, div0, null);
    			append(div0, t7);
    			mount_component(square2, div0, null);
    			append(main, t8);
    			append(main, div1);
    			mount_component(square3, div1, null);
    			append(div1, t9);
    			mount_component(square4, div1, null);
    			append(div1, t10);
    			mount_component(square5, div1, null);
    			append(main, t11);
    			append(main, div2);
    			mount_component(square6, div2, null);
    			append(div2, t12);
    			mount_component(square7, div2, null);
    			append(div2, t13);
    			mount_component(square8, div2, null);
    			append(main, t14);
    			if (if_block1) if_block1.m(main, null);
    			append(main, t15);
    			if (if_block2) if_block2.m(main, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*numPlayers*/ 1) set_data(t3, /*numPlayers*/ ctx[0]);

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(main, t5);
    				}
    			}

    			const square0_changes = {};
    			if (dirty & /*winner*/ 8) square0_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square0_changes.state = /*board*/ ctx[2][0];
    			square0.$set(square0_changes);
    			const square1_changes = {};
    			if (dirty & /*winner*/ 8) square1_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square1_changes.state = /*board*/ ctx[2][1];
    			square1.$set(square1_changes);
    			const square2_changes = {};
    			if (dirty & /*winner*/ 8) square2_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square2_changes.state = /*board*/ ctx[2][2];
    			square2.$set(square2_changes);
    			const square3_changes = {};
    			if (dirty & /*winner*/ 8) square3_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square3_changes.state = /*board*/ ctx[2][3];
    			square3.$set(square3_changes);
    			const square4_changes = {};
    			if (dirty & /*winner*/ 8) square4_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square4_changes.state = /*board*/ ctx[2][4];
    			square4.$set(square4_changes);
    			const square5_changes = {};
    			if (dirty & /*winner*/ 8) square5_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square5_changes.state = /*board*/ ctx[2][5];
    			square5.$set(square5_changes);
    			const square6_changes = {};
    			if (dirty & /*winner*/ 8) square6_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square6_changes.state = /*board*/ ctx[2][6];
    			square6.$set(square6_changes);
    			const square7_changes = {};
    			if (dirty & /*winner*/ 8) square7_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square7_changes.state = /*board*/ ctx[2][7];
    			square7.$set(square7_changes);
    			const square8_changes = {};
    			if (dirty & /*winner*/ 8) square8_changes.winner = /*winner*/ ctx[3];
    			if (dirty & /*board*/ 4) square8_changes.state = /*board*/ ctx[2][8];
    			square8.$set(square8_changes);

    			if (/*winner*/ ctx[3]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_1(ctx);
    					if_block1.c();
    					if_block1.m(main, t15);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*errorMsg*/ ctx[4]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block(ctx);
    					if_block2.c();
    					if_block2.m(main, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(square0.$$.fragment, local);
    			transition_in(square1.$$.fragment, local);
    			transition_in(square2.$$.fragment, local);
    			transition_in(square3.$$.fragment, local);
    			transition_in(square4.$$.fragment, local);
    			transition_in(square5.$$.fragment, local);
    			transition_in(square6.$$.fragment, local);
    			transition_in(square7.$$.fragment, local);
    			transition_in(square8.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(square0.$$.fragment, local);
    			transition_out(square1.$$.fragment, local);
    			transition_out(square2.$$.fragment, local);
    			transition_out(square3.$$.fragment, local);
    			transition_out(square4.$$.fragment, local);
    			transition_out(square5.$$.fragment, local);
    			transition_out(square6.$$.fragment, local);
    			transition_out(square7.$$.fragment, local);
    			transition_out(square8.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			if_block0.d();
    			destroy_component(square0);
    			destroy_component(square1);
    			destroy_component(square2);
    			destroy_component(square3);
    			destroy_component(square4);
    			destroy_component(square5);
    			destroy_component(square6);
    			destroy_component(square7);
    			destroy_component(square8);
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let numPlayers = 0;
    	let currentPlayer = "X";
    	let board = ["", "", "", "", "", "", "", "", ""];
    	let winner;
    	let errorMsg;

    	gameStore.subscribe(data => {
    		if (!data) {
    			return;
    		}

    		$$invalidate(3, winner = data.winner);
    		$$invalidate(1, currentPlayer = data.nextPlayer);
    		$$invalidate(2, board = data.board);
    		$$invalidate(0, numPlayers = data.numberOfPeeps);
    	});

    	async function takeSquare(square_id) {
    		if (winner || !gameStore.isConnected) return;
    		$$invalidate(4, errorMsg = await requests.nextMove(square_id));
    	}

    	async function newGame() {
    		requests.newGame();
    	}

    	const click_handler = () => takeSquare(0);
    	const click_handler_1 = () => takeSquare(1);
    	const click_handler_2 = () => takeSquare(2);
    	const click_handler_3 = () => takeSquare(3);
    	const click_handler_4 = () => takeSquare(4);
    	const click_handler_5 = () => takeSquare(5);
    	const click_handler_6 = () => takeSquare(6);
    	const click_handler_7 = () => takeSquare(7);
    	const click_handler_8 = () => takeSquare(8);

    	return [
    		numPlayers,
    		currentPlayer,
    		board,
    		winner,
    		errorMsg,
    		takeSquare,
    		newGame,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		click_handler_5,
    		click_handler_6,
    		click_handler_7,
    		click_handler_8
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    const app = new App({
    	target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
