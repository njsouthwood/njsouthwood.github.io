document.addEventListener('DOMContentLoaded', () => {

    const toggleButton = document.getElementById('dark-mode-button');
    const body = document.body;
    const socialIcons = document.getElementsByClassName('social-icon')
    
    
    
    // Check for saved 'darkMode' in localStorage
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'true') {
        body.classList.add('dark-mode');
        toggleButton.classList.add('dark-mode');
        toggleButton.textContent = 'Light';
        Object.values(socialIcons).forEach(si => si.classList.add('dark-mode'))
    }
    
    toggleButton.onclick = function() {
        body.classList.toggle('dark-mode');
        toggleButton.classList.toggle('dark-mode')
        Object.values(socialIcons).forEach(si => si.classList.toggle('dark-mode'))
        
        const isDark = body.classList.contains('dark-mode');

        toggleButton.textContent = isDark ? 'Light' : 'Dark';

        // Save the current preference to localStorage
        localStorage.setItem('darkMode', isDark);
    
    }
})
