import { Component } from '@theme/component';

class ProductRecommendations extends Component {
  /**
   * The observer for the product recommendations
   * @type {IntersectionObserver}
   */
  #intersectionObserver = new IntersectionObserver(
    (entries, observer) => {
      if (!entries[0]?.isIntersecting) return;

      observer.disconnect();
      this.#loadRecommendations();
    },
    { rootMargin: '0px 0px 400px 0px' }
  );

  /**
   * Observing changes to the elements attributes
   * @type {MutationObserver}
   */
  #mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Only attribute changes are interesting
      if (mutation.target !== this || mutation.type !== 'attributes') continue;

      // Ignore error attribute changes
      if (mutation.attributeName === 'data-error') continue;

      // Ignore addition of hidden class because it means there's an error with the display
      if (mutation.attributeName === 'class' && this.classList.contains('hidden')) continue;

      // Ignore when the data-recommendations-performed attribute has been set to 'true'
      if (
        mutation.attributeName === 'data-recommendations-performed' &&
        this.dataset.recommendationsPerformed === 'true'
      )
        continue;

      // All other attribute changes trigger a reload
      this.#loadRecommendations();
      break;
    }
  });

  /**
   * The cached recommendations
   * @type {Record<string, string>}
   */
  #cachedRecommendations = {};

  /**
   * An abort controller for the active fetch (if there is one)
   * @type {AbortController | null}
   */
  #activeFetch = null;

  connectedCallback() {
    super.connectedCallback();
    this.#intersectionObserver.observe(this);
    this.#mutationObserver.observe(this, { attributes: true });
    
    // If the recommendations are already loaded on mount (e.g. static/theme preview), initialize features
    if (this.dataset.recommendationsPerformed === 'true') {
      this.#initCarouselAndFeatures();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#intersectionObserver.disconnect();
    this.#mutationObserver.disconnect();
  }

  /**
   * Load the product recommendations
   */
  #loadRecommendations() {
    const { productId, recommendationsPerformed, sectionId, intent } = this.dataset;
    const id = this.id;

    if (!productId || !id) {
      throw new Error('Product ID and an ID attribute are required');
    }

    // If the recommendations have already been loaded, accounts for the case where the Theme Editor
    // is loaded the section from the editor's visual preview context.
    if (recommendationsPerformed === 'true') {
      return;
    }

    this.#fetchCachedRecommendations(productId, sectionId, intent)
      .then((result) => {
        if (!result.success) {
          // The Theme Editor will place a section element element in the DOM whose section_id is not available
          // to the Section Renderer API. In this case, we can safely ignore the error.
          if (!Shopify.designMode) {
            this.#handleError(new Error(`Server returned ${result.status}`));
          }
          return;
        }

        const html = document.createElement('div');
        html.innerHTML = result.data || '';
        const recommendations = html.querySelector(`product-recommendations[id="${id}"]`);

        if (recommendations?.innerHTML && recommendations.innerHTML.trim().length) {
          this.dataset.recommendationsPerformed = 'true';
          this.innerHTML = recommendations.innerHTML;
          // Initialize carousel control, overlay animations, hover events and add to cart flow
          this.#initCarouselAndFeatures();
        } else {
          this.#handleError(new Error('No recommendations available'));
        }
      })
      .catch((e) => {
        this.#handleError(e);
      });
  }

  /**
   * Fetches the recommendations and cached the result for future use
   * @param {string} productId
   * @param {string | undefined} sectionId
   * @param {string | undefined} intent
   * @returns {Promise<{ success: true, data: string } | { success: false, status: number }>}
   */
  async #fetchCachedRecommendations(productId, sectionId, intent) {
    const url = `${this.dataset.url}&product_id=${productId}&section_id=${sectionId}&intent=${intent}`;

    const cachedResponse = this.#cachedRecommendations[url];
    if (cachedResponse) {
      return { success: true, data: cachedResponse };
    }

    this.#activeFetch?.abort();
    this.#activeFetch = new AbortController();

    try {
      const response = await fetch(url, { signal: this.#activeFetch.signal });
      if (!response.ok) {
        return { success: false, status: response.status };
      }

      const text = await response.text();
      this.#cachedRecommendations[url] = text;
      return { success: true, data: text };
    } finally {
      this.#activeFetch = null;
    }
  }

  /**
   * Handle errors in a consistent way
   * @param {Error} error
   */
  #handleError(error) {
    console.error('Product recommendations error:', error.message);
    this.classList.add('hidden');
    this.dataset.error = 'Error loading product recommendations';
  }

  /**
   * Initialize Collection Hover Carousel features:
   * - horizontal smooth scroll navigation buttons
   * - hover reveals plus (+) button
   * - click plus button to slide up sizes overlay
   * - click outside or timer to slide down/close overlay
   * - color swatch reactivity to size buttons availability
   */
  #initCarouselAndFeatures() {
    const track = this.querySelector('.collection-hover-carousel__track');
    const prevBtn = this.querySelector('.collection-hover-carousel__btn--prev');
    const nextBtn = this.querySelector('.collection-hover-carousel__btn--next');

    // 1. Carousel horizontal control
    if (track && prevBtn && nextBtn) {
      const getScrollAmount = () => {
        const firstItem = track.querySelector('.collection-hover-carousel__item');
        if (firstItem) {
          const style = window.getComputedStyle(track);
          const gap = parseFloat(style.columnGap || style.gap) || 20;
          return firstItem.getBoundingClientRect().width + gap; 
        }
        return 300;
      };

      if (!prevBtn.dataset.hasListener) {
        prevBtn.addEventListener('click', (e) => {
          e.preventDefault();
          track.scrollBy({
            left: -getScrollAmount(),
            behavior: 'smooth'
          });
        });
        prevBtn.dataset.hasListener = 'true';
      }

      if (!nextBtn.dataset.hasListener) {
        nextBtn.addEventListener('click', (e) => {
          e.preventDefault();
          track.scrollBy({
            left: getScrollAmount(),
            behavior: 'smooth'
          });
        });
        nextBtn.dataset.hasListener = 'true';
      }
    }

    // 2. Title fade-in visual reveal
    const header = this.querySelector('.collection-hover-carousel__header');
    if (header) {
      if (!('IntersectionObserver' in window)) {
        header.classList.add('title-visible');
      } else {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              header.classList.add('title-visible');
            } else {
              header.classList.remove('title-visible');
            }
          });
        }, {
          threshold: 0.2
        });
        observer.observe(this);
      }
    }

    // 3. Quick Add / Hover interactions / sizes slide popup
    const cards = this.querySelectorAll('.collection-hover-carousel__card');
    cards.forEach(card => {
      const quickAddContainer = card.querySelector('.collection-hover-carousel__quick-add');
      if (!quickAddContainer) return;

      const plusBtn = quickAddContainer.querySelector('.collection-hover-carousel__quick-add-btn');
      const sizesOverlay = quickAddContainer.querySelector('.collection-hover-carousel__sizes-overlay');
      const sizeButtons = quickAddContainer.querySelectorAll('.collection-hover-carousel__size-opt');

      const updateAvailability = () => {
        const jsonEl = quickAddContainer.querySelector('.product-variants-json');
        if (!jsonEl) return;
        const variants = JSON.parse(jsonEl.textContent);

        const checkedSwatch = card.querySelector('product-swatches input[type="radio"]:checked');
        const selectedColor = checkedSwatch ? checkedSwatch.value.trim() : null;

        sizeButtons.forEach(btn => {
          const sizeValue = btn.dataset.sizeValue.trim();
          const sizeIndex = parseInt(btn.dataset.sizeIndex, 10);

          let isAvailable = false;
          for (const variant of variants) {
            if (!variant.available) continue;
            if (variant.options[sizeIndex] !== sizeValue) continue;

            if (selectedColor) {
              let matchesColor = false;
              for (let i = 0; i < variant.options.length; i++) {
                if (i !== sizeIndex && variant.options[i] === selectedColor) {
                  matchesColor = true;
                  break;
                }
              }
              if (!matchesColor) continue;
            }
            isAvailable = true;
            break;
          }

          if (isAvailable) {
            btn.classList.remove('is-unavailable');
            btn.disabled = false;
          } else {
            btn.classList.add('is-unavailable');
            btn.disabled = true;
          }
        });
      };

      updateAvailability();

      if (!card.dataset.hasListener) {
        card.addEventListener('change', (e) => {
          if (e.target.name && e.target.name.includes('-swatch')) {
            updateAvailability();
          }
        });
        card.dataset.hasListener = 'true';
      }

      let dismissTimeout = null;

      const startDismissTimer = () => {
        clearDismissTimer();
        dismissTimeout = setTimeout(() => {
          quickAddContainer.classList.remove('is-active');
        }, 3000);
      };

      const clearDismissTimer = () => {
        if (dismissTimeout) {
          clearTimeout(dismissTimeout);
          dismissTimeout = null;
        }
      };

      quickAddContainer._clearDismissTimer = clearDismissTimer;

      if (plusBtn && !plusBtn.dataset.hasListener) {
        plusBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (sizesOverlay) {
            this.querySelectorAll('.collection-hover-carousel__quick-add').forEach(el => {
              if (el !== quickAddContainer) {
                el.classList.remove('is-active');
                if (typeof el._clearDismissTimer === 'function') {
                  el._clearDismissTimer();
                }
              }
            });

            const isActive = quickAddContainer.classList.contains('is-active');
            if (isActive) {
              quickAddContainer.classList.remove('is-active');
              clearDismissTimer();
            } else {
              quickAddContainer.classList.add('is-active');
              startDismissTimer();
            }
          } else {
            const jsonEl = quickAddContainer.querySelector('.product-variants-json');
            if (!jsonEl) return;
            const variants = JSON.parse(jsonEl.textContent);

            const checkedSwatch = card.querySelector('product-swatches input[type="radio"]:checked');
            const selectedColor = checkedSwatch ? checkedSwatch.value.trim() : null;

            let targetVariant = null;
            if (selectedColor) {
              targetVariant = variants.find(v => v.available && v.options.includes(selectedColor));
            }
            if (!targetVariant) {
              targetVariant = variants.find(v => v.available);
            }
            if (!targetVariant) {
              targetVariant = variants[0];
            }

            if (targetVariant) {
              this.#addToCart(targetVariant.id, quickAddContainer, plusBtn);
            }
          }
        });
        plusBtn.dataset.hasListener = 'true';
      }

      if (!card.dataset.hasLeaveListener) {
        card.addEventListener('mouseenter', () => {
          clearDismissTimer();
        });

        card.addEventListener('mouseleave', () => {
          if (quickAddContainer.classList.contains('is-active')) {
            startDismissTimer();
          }
        });
        card.dataset.hasLeaveListener = 'true';
      }

      if (sizesOverlay && !sizesOverlay.dataset.hasListener) {
        sizesOverlay.addEventListener('click', (e) => {
          e.stopPropagation();
          clearDismissTimer();
          startDismissTimer();
        });
        sizesOverlay.dataset.hasListener = 'true';
      }

      sizeButtons.forEach(btn => {
        if (!btn.dataset.hasListener) {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const sizeValue = btn.dataset.sizeValue.trim();
            const sizeIndex = parseInt(btn.dataset.sizeIndex, 10);

            const jsonEl = quickAddContainer.querySelector('.product-variants-json');
            if (!jsonEl) return;
            const variants = JSON.parse(jsonEl.textContent);

            const checkedSwatch = card.querySelector('product-swatches input[type="radio"]:checked');
            const selectedColor = checkedSwatch ? checkedSwatch.value.trim() : null;

            let targetVariant = null;
            for (const variant of variants) {
              if (variant.options[sizeIndex] !== sizeValue) continue;
              if (selectedColor) {
                let matchesColor = false;
                for (let i = 0; i < variant.options.length; i++) {
                  if (i !== sizeIndex && variant.options[i] === selectedColor) {
                    matchesColor = true;
                    break;
                  }
                }
                if (!matchesColor) continue;
              }
              targetVariant = variant;
              if (variant.available) {
                break;
              }
            }

            if (targetVariant) {
              clearDismissTimer();
              this.#addToCart(targetVariant.id, quickAddContainer, btn);
            }
          });
          btn.dataset.hasListener = 'true';
        }
      });
    });

    // Close overlays when clicking outside
    if (!this._hasClickOutsideListener) {
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.collection-hover-carousel__quick-add')) {
          this.querySelectorAll('.collection-hover-carousel__quick-add').forEach(el => {
            el.classList.remove('is-active');
            if (typeof el._clearDismissTimer === 'function') {
              el._clearDismissTimer();
            }
          });
        }
      });
      this._hasClickOutsideListener = true;
    }
  }

  /**
   * Ajax Add to Cart and automatic Cart Drawer slide open mechanism
   */
  #addToCart(variantId, container, triggerBtn) {
    if (!variantId) return;

    triggerBtn.disabled = true;
    triggerBtn.classList.add('is-loading');
    const originalContent = triggerBtn.innerHTML;

    if (triggerBtn.classList.contains('collection-hover-carousel__quick-add-btn')) {
      triggerBtn.innerHTML = '<span class="btn-spinner"></span>';
    } else {
      triggerBtn.innerHTML = '...';
    }

    const formData = new FormData();
    formData.append('id', variantId);
    formData.append('quantity', 1);

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    let cartItemComponentsSectionIds = [];
    cartItemsComponents.forEach((item) => {
      if (item && item.dataset && item.dataset.sectionId) {
        cartItemComponentsSectionIds.push(item.dataset.sectionId);
      }
    });
    if (cartItemComponentsSectionIds.length > 0) {
      formData.append('sections', cartItemComponentsSectionIds.join(','));
    }

    fetch(window.Shopify?.routes?.root + 'cart/add.js', {
      method: 'POST',
      body: formData,
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    .then(response => response.json())
    .then(response => {
      if (response.status) {
        alert(response.description || response.message);
        triggerBtn.classList.remove('is-loading');
        triggerBtn.innerHTML = originalContent;
        triggerBtn.disabled = false;
      } else {
        triggerBtn.classList.remove('is-loading');
        triggerBtn.classList.add('is-success');

        if (triggerBtn.classList.contains('collection-hover-carousel__quick-add-btn')) {
          triggerBtn.innerHTML = '<svg class="success-checkmark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else {
          triggerBtn.innerHTML = '✓';
        }

        fetch(window.Shopify?.routes?.root + 'cart.js')
          .then(res => res.json())
          .then(cart => {
            const event = new CustomEvent('cart:update', {
              bubbles: true,
              detail: {
                resource: cart,
                sourceId: variantId.toString(),
                data: {
                  source: 'product-form-component',
                  itemCount: 1,
                  productId: container.dataset.productId,
                  sections: response.sections
                }
              }
            });
            document.dispatchEvent(event);

            const cartDrawer = document.querySelector('cart-drawer-component');
            if (cartDrawer) {
              cartDrawer.open();
            }
          });

        setTimeout(() => {
          triggerBtn.classList.remove('is-success');
          triggerBtn.innerHTML = originalContent;
          triggerBtn.disabled = false;
          container.classList.remove('is-active');
        }, 2000);
      }
    })
    .catch(err => {
      console.error('Error adding to cart:', err);
      triggerBtn.classList.remove('is-loading');
      triggerBtn.innerHTML = originalContent;
      triggerBtn.disabled = false;
    });
  }
}

if (!customElements.get('product-recommendations')) {
  customElements.define('product-recommendations', ProductRecommendations);
}
