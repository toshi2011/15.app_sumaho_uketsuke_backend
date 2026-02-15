export default {
    beforeCreate(event) {
        const { data } = event.params;
        validateCapacity(data);
    },

    beforeUpdate(event) {
        const { data } = event.params;
        validateCapacity(data);
    },
};

function validateCapacity(data) {
    if (data.minCapacity && data.baseCapacity) {
        if (data.minCapacity > data.baseCapacity) {
            throw new Error('minCapacity cannot be greater than baseCapacity');
        }
    }
}
